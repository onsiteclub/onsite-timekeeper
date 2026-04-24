/**
 * Invoice Publish - OnSite Timekeeper
 *
 * Uploads the invoice PDF to Supabase Storage and registers the hosted
 * HTML + PDF URL under a short slug in `invoice_short_links`. The
 * slug is served by the `r` edge function, which both renders the
 * HTML (with a proper text/html content-type) and redirects to the
 * PDF when `/r/<slug>/pdf` is requested.
 *
 * Why the HTML lives in the DB (not Supabase Storage):
 * Supabase forces `Content-Type: text/plain` + sandbox CSP on any HTML
 * served out of a public bucket (XSS prevention on their domain). So
 * we keep the HTML in `invoice_short_links.html` and let the edge
 * function serve it from its own origin, where we control headers.
 *
 * Only the PDF is uploaded to Storage — it's a binary with a real
 * content-type that browsers handle fine, and we still want it as a
 * downloadable artefact for the "Download PDF" button.
 *
 * Path scheme: {user_id}/{invoice_id}.pdf
 * Short link:  https://{ref}.supabase.co/functions/v1/r/{slug}
 */

import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { logger } from './logger';

const BUCKET = 'invoices';

// Resolve the project URL the same way supabase.ts does.
const SUPABASE_URL: string =
  (process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined) ||
  (Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL as string | undefined) ||
  '';

export interface PublishedUrls {
  /** Short redirect URL handled by the `r` edge function (preferred for sharing). */
  shortUrl: string;
  /** Direct public URL to the PDF file in Supabase Storage. */
  pdfUrl: string;
}

/**
 * Compute the expected public URL for the invoice PDF. Used to bake a
 * "Download PDF" link into the hosted HTML *before* the upload — the
 * path is deterministic so we don't need a DB round-trip for this.
 */
export function getInvoicePublicUrls(userId: string, invoiceId: string): { pdfUrl: string } {
  const pdfPath = `${userId}/${invoiceId}.pdf`;
  const { data: p } = supabase.storage.from(BUCKET).getPublicUrl(pdfPath);
  return { pdfUrl: p.publicUrl };
}

// ============================================
// BASE64 -> UINT8ARRAY (RN-safe)
// ============================================

function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ============================================
// SHORT SLUG (opaque token, ~40 bits of randomness)
// ============================================
// expo-crypto is used because React Native doesn't ship a global
// `crypto.getRandomValues`. The rest of the project already uses it
// (see src/lib/oauth.ts).

async function generateSlug(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(5);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function buildShortUrl(slug: string): string {
  // If EXPO_PUBLIC_SUPABASE_URL isn't set the short link won't work,
  // but that's a configuration problem; the caller's fallback path
  // will still send the PDF without a link.
  return `${SUPABASE_URL}/functions/v1/r/${slug}`;
}

/**
 * Insert or update the short-link row for this invoice. Returns the
 * slug on success, null if the RLS/DB call fails — the caller treats
 * null as "share without a link" rather than blocking the share.
 */
async function upsertShortLink(params: {
  userId: string;
  invoiceId: string;
  html: string;
  pdfUrl: string;
}): Promise<string | null> {
  const { userId, invoiceId, html, pdfUrl } = params;
  try {
    const { data: existing, error: selErr } = await supabase
      .from('invoice_short_links')
      .select('slug')
      .eq('invoice_id', invoiceId)
      .maybeSingle();

    if (selErr) {
      logger.warn('invoice', 'Short link lookup failed', { error: String(selErr.message) });
    }

    if (existing?.slug) {
      // Refresh stored HTML + pdf_url; invoice edits may have changed them.
      const { error: updErr } = await supabase
        .from('invoice_short_links')
        .update({
          html,
          pdf_url: pdfUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('invoice_id', invoiceId);
      if (updErr) {
        logger.warn('invoice', 'Short link update failed', { error: String(updErr.message) });
        return null;
      }
      return existing.slug;
    }

    // Fresh row. Retry once on the (extremely unlikely) slug collision.
    for (let attempt = 0; attempt < 2; attempt++) {
      const slug = await generateSlug();
      const { error } = await supabase.from('invoice_short_links').insert({
        invoice_id: invoiceId,
        slug,
        user_id: userId,
        html,
        pdf_url: pdfUrl,
      });
      if (!error) return slug;
      if (error.code !== '23505') {
        logger.warn('invoice', 'Short link insert failed', { code: String(error.code), error: String(error.message) });
        return null;
      }
    }
    return null;
  } catch (err) {
    logger.warn('invoice', 'Short link upsert threw', { error: String(err) });
    return null;
  }
}

// ============================================
// PUBLISH
// ============================================

export async function publishInvoiceFiles(params: {
  userId: string;
  invoiceId: string;
  html: string;
  pdfUri: string;
}): Promise<PublishedUrls | null> {
  const { userId, invoiceId, html, pdfUri } = params;

  try {
    // 1. Upload PDF to Storage (binary — content-type isn't sabotaged).
    const pdfBase64 = await FileSystem.readAsStringAsync(pdfUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const pdfBytes = base64ToBytes(pdfBase64);
    const pdfPath = `${userId}/${invoiceId}.pdf`;

    const pdfRes = await supabase.storage.from(BUCKET).upload(pdfPath, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
      cacheControl: '300',
    });

    if (pdfRes.error) {
      logger.warn('invoice', 'PDF upload failed', { error: String(pdfRes.error.message) });
      return null;
    }

    const { data: pdfPublic } = supabase.storage.from(BUCKET).getPublicUrl(pdfPath);
    if (!pdfPublic?.publicUrl) {
      logger.warn('invoice', 'PDF public URL resolution failed');
      return null;
    }

    // 2. Upsert the short-link row with the HTML and PDF URL so the
    //    edge function can serve the hosted viewer from the DB.
    const slug = await upsertShortLink({
      userId,
      invoiceId,
      html,
      pdfUrl: pdfPublic.publicUrl,
    });

    if (!slug) {
      // We still have a valid PDF URL, but no short link. Caller can
      // fall back to sharing just the PDF.
      logger.info('invoice', 'Published PDF only (no short link)');
      return null;
    }

    const shortUrl = buildShortUrl(slug);
    logger.info('invoice', `Invoice published (slug ${slug})`);
    return {
      shortUrl,
      pdfUrl: pdfPublic.publicUrl,
    };
  } catch (err) {
    logger.warn('invoice', 'Invoice publish failed', { error: String(err) });
    return null;
  }
}
