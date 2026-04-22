/**
 * Invoice Publish - OnSite Timekeeper
 *
 * Uploads the hosted HTML page + PDF archive for an invoice to Supabase
 * Storage (bucket: "invoices"). Returns the public URLs so the share flow
 * can send a link instead of just a file attachment.
 *
 * Path scheme: {user_id}/{invoice_id}.{html|pdf}
 *
 * Relies on RLS policies in Supabase:
 *   - authenticated user can write to their own {user_id}/* prefix
 *   - public can read any file in the bucket (UUID path acts as opaque token)
 *
 * Upload failures (offline, auth expired, bucket missing) are reported to
 * the caller as null so it can fall back to the local-file share path.
 */

import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';
import { logger } from './logger';

const BUCKET = 'invoices';

export interface PublishedUrls {
  htmlUrl: string;
  pdfUrl: string;
}

/**
 * Compute the expected public URLs for an invoice's files. Supabase Storage
 * builds public URLs deterministically from the path, so we can resolve
 * these before the upload actually happens and bake the pdfUrl into the
 * HTML template before it's uploaded.
 */
export function getInvoicePublicUrls(userId: string, invoiceId: string): PublishedUrls {
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

    logger.info('invoice', 'Invoice published to Supabase Storage');
    return {
      htmlUrl: htmlPublic.publicUrl,
      pdfUrl: pdfPublic.publicUrl,
    };
  } catch (err) {
    logger.warn('invoice', 'Invoice publish failed', { error: String(err) });
    return null;
  }
}
