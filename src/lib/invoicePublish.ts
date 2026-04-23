/**
 * Invoice Publish - OnSite Timekeeper
 *
 * Uploads the hosted HTML page + PDF archive for an invoice to Supabase
 * Storage (bucket: "invoices") and registers a short slug in the
 * `invoice_short_links` table so the share flow can send a compact URL
 * instead of the full 140-char storage URL.
 *
 * Path scheme: {user_id}/{invoice_id}.{html|pdf}
 * Short link:  https://{ref}.supabase.co/functions/v1/r/{slug}
 *
 * Relies on RLS policies in Supabase:
 *   - authenticated user can write to their own {user_id}/* storage prefix
 *   - public can read any file in the bucket (UUID path acts as opaque token)
 *   - authenticated user can insert/update their own invoice_short_links row
 *
 * Upload failures (offline, auth expired, bucket missing) are reported to
 * the caller as null so it can fall back to the local-file share path.
 */

import * as FileSystem from 'expo-file-system';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { logger } from './logger';

const BUCKET = 'invoices';

// Resolve the project URL the same way supabase.ts does. Used to build
// the short-link URL once we know the slug.
const SUPABASE_URL: string =
  (process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined) ||
  (Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL as string | undefined) ||
  '';

export interface PublishedUrls {
  htmlUrl: string;
  pdfUrl: string;
  /** Short redirect URL handled by the `r` edge function. Falls back to htmlUrl if unavailable. */
  shortUrl: string;
}

/**
 * Compute the expected public URLs for an invoice's files. Supabase Storage
 * builds public URLs deterministically from the path, so we can resolve
 * these before the upload actually happens and bake the pdfUrl into the
 * HTML template before it's uploaded. Does NOT resolve the short URL —
 * that requires a DB round-trip and is only meaningful after publish.
 */
export function getInvoicePublicUrls(userId: string, invoiceId: string): { htmlUrl: string; pdfUrl: string } {
  const htmlPath = `${userId}/${invoiceId}.html`;
  const pdfPath = `${userId}/${invoiceId}.pdf`;
  const { data: h } = supabase.storage.from(BUCKET).getPublicUrl(htmlPath);
  const { data: p } = supabase.storage.from(BUCKET).getPublicUrl(pdfPath);
  return { htmlUrl: h.publicUrl, pdfUrl: p.publicUrl };
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

function generateSlug(): string {
  const bytes = new Uint8Array(5);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function buildShortUrl(slug: string, fallbackHtmlUrl: string): string {
  if (!SUPABASE_URL) return fallbackHtmlUrl;
  return `${SUPABASE_URL}/functions/v1/r/${slug}`;
}

async function upsertShortLink(params: {
  userId: string;
  invoiceId: string;
  htmlUrl: string;
  pdfUrl: string;
}): Promise<string | null> {
  const { userId, invoiceId, htmlUrl, pdfUrl } = params;
  try {
    const { data: existing } = await supabase
      .from('invoice_short_links')
      .select('slug')
      .eq('invoice_id', invoiceId)
      .maybeSingle();

    if (existing?.slug) {
      // Refresh URLs (business profile / client edits may have changed them).
      await supabase
        .from('invoice_short_links')
        .update({ html_url: htmlUrl, pdf_url: pdfUrl, updated_at: new Date().toISOString() })
        .eq('invoice_id', invoiceId);
      return existing.slug;
    }

    // Insert with a fresh slug. Retry once on unlikely collision.
    for (let attempt = 0; attempt < 2; attempt++) {
      const slug = generateSlug();
      const { error } = await supabase.from('invoice_short_links').insert({
        invoice_id: invoiceId,
        slug,
        user_id: userId,
        html_url: htmlUrl,
        pdf_url: pdfUrl,
      });
      if (!error) return slug;
      if (error.code !== '23505') {
        logger.warn('invoice', 'Short link insert failed', { error: String(error.message) });
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
    // Read PDF into bytes (Supabase Storage JS client accepts Uint8Array).
    const pdfBase64 = await FileSystem.readAsStringAsync(pdfUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const pdfBytes = base64ToBytes(pdfBase64);

    const htmlPath = `${userId}/${invoiceId}.html`;
    const pdfPath = `${userId}/${invoiceId}.pdf`;

    const [htmlRes, pdfRes] = await Promise.all([
      supabase.storage.from(BUCKET).upload(htmlPath, html, {
        contentType: 'text/html; charset=utf-8',
        upsert: true,
        cacheControl: '300',
      }),
      supabase.storage.from(BUCKET).upload(pdfPath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
        cacheControl: '300',
      }),
    ]);

    if (htmlRes.error) {
      logger.warn('invoice', 'HTML upload failed', { error: String(htmlRes.error.message) });
      return null;
    }
    if (pdfRes.error) {
      logger.warn('invoice', 'PDF upload failed', { error: String(pdfRes.error.message) });
      return null;
    }

    const { data: htmlPublic } = supabase.storage.from(BUCKET).getPublicUrl(htmlPath);
    const { data: pdfPublic } = supabase.storage.from(BUCKET).getPublicUrl(pdfPath);

    if (!htmlPublic?.publicUrl || !pdfPublic?.publicUrl) {
      logger.warn('invoice', 'Public URL resolution failed');
      return null;
    }

    const slug = await upsertShortLink({
      userId,
      invoiceId,
      htmlUrl: htmlPublic.publicUrl,
      pdfUrl: pdfPublic.publicUrl,
    });

    const shortUrl = slug ? buildShortUrl(slug, htmlPublic.publicUrl) : htmlPublic.publicUrl;

    logger.info('invoice', `Invoice published${slug ? ` (slug ${slug})` : ' (no slug, long URL)'}`);
    return {
      htmlUrl: htmlPublic.publicUrl,
      pdfUrl: pdfPublic.publicUrl,
      shortUrl,
    };
  } catch (err) {
    logger.warn('invoice', 'Invoice publish failed', { error: String(err) });
    return null;
  }
}
