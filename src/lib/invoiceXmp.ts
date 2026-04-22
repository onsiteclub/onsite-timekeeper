/**
 * Invoice XMP Metadata - OnSite Timekeeper
 *
 * Embeds structured XMP metadata into generated invoice PDFs using the
 * custom OnSite Club namespace so downstream systems (OnSite Ops) can
 * parse invoice fields precisely when the PDF is delivered by email.
 *
 * The visual layout of the PDF is untouched; only the hidden metadata
 * stream is added/overwritten.
 *
 * Namespace: http://schemas.onsiteclub.ca/invoice/1.0/
 */

import * as FileSystem from 'expo-file-system';
import { PDFDocument, PDFName } from 'pdf-lib';
import { logger } from './logger';

// ============================================
// TYPES
// ============================================

/**
 * Structured fields embedded under the onsite:* XMP namespace.
 * Empty string means "not applicable" — tags are always emitted so the
 * downstream parser sees a stable schema. Never rename existing keys.
 */
export interface OnsiteInvoiceXmp {
  invoice_number: string;
  amount: number;          // subtotal (pre-tax), 2 decimals
  hst: number;             // tax amount, 2 decimals
  currency: string;        // e.g. "CAD"
  gc_name: string;         // general contractor / client name
  site_address: string;    // work site address / location name (may be empty)
  issuer_email: string;
  issuer_name: string;
  company_name: string;
  company_hst_number: string;
  hours_logged: number;    // total hours (float). 0 for non-hourly invoices.
  issued_at: string;       // ISO 8601 UTC, e.g. "2026-04-18T09:23:00Z"
  timekeeper_version: string;
}

// ============================================
// HELPERS
// ============================================

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDecimal(n: number): string {
  // No regional formatting — always ".", always 2 decimals.
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

function formatHours(n: number): string {
  // Hours may legitimately carry fractional minutes (e.g. 38.25).
  // Use up to 2 decimals but trim trailing zeros to keep the value compact.
  if (!Number.isFinite(n)) return '0';
  const s = n.toFixed(2);
  return s.replace(/\.?0+$/, '') || '0';
}

// ============================================
// XMP PACKET BUILDER
// ============================================

export function buildXmpPacket(meta: OnsiteInvoiceXmp): string {
  const fields: [string, string][] = [
    ['invoice_number', escapeXml(meta.invoice_number ?? '')],
    ['amount', formatDecimal(meta.amount)],
    ['hst', formatDecimal(meta.hst)],
    ['currency', escapeXml(meta.currency ?? '')],
    ['gc_name', escapeXml(meta.gc_name ?? '')],
    ['site_address', escapeXml(meta.site_address ?? '')],
    ['issuer_email', escapeXml(meta.issuer_email ?? '')],
    ['issuer_name', escapeXml(meta.issuer_name ?? '')],
    ['company_name', escapeXml(meta.company_name ?? '')],
    ['company_hst_number', escapeXml(meta.company_hst_number ?? '')],
    ['hours_logged', formatHours(meta.hours_logged)],
    ['issued_at', escapeXml(meta.issued_at ?? '')],
    ['timekeeper_version', escapeXml(meta.timekeeper_version ?? '')],
  ];

  const body = fields
    .map(([k, v]) => `      <onsite:${k}>${v}</onsite:${k}>`)
    .join('\n');

  // Standard XMP packet with BOM in xpacket begin, per XMP spec.
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="OnSite Timekeeper">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:onsite="http://schemas.onsiteclub.ca/invoice/1.0/">
${body}
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

// ============================================
// BASE64 <-> UINT8ARRAY (chunked, RN-safe)
// ============================================

function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  // String.fromCharCode.apply blows the stack on large arrays; chunk it.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return globalThis.btoa(binary);
}

function utf8Encode(str: string): Uint8Array {
  // React Native polyfills TextEncoder since 0.74; fall back to manual UTF-8
  // conversion for safety.
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  const utf8 = unescape(encodeURIComponent(str));
  const bytes = new Uint8Array(utf8.length);
  for (let i = 0; i < utf8.length; i++) bytes[i] = utf8.charCodeAt(i);
  return bytes;
}

// ============================================
// PDF POST-PROCESSING
// ============================================

/**
 * Inject the onsite:* XMP metadata packet into an existing PDF file,
 * overwriting the file in place. Standard info dict (Title, Author, etc.)
 * written by expo-print is preserved. Silently succeeds or logs a warning
 * on failure — invoice PDF remains usable either way.
 */
export async function embedXmpIntoPdf(
  pdfUri: string,
  meta: OnsiteInvoiceXmp,
): Promise<void> {
  try {
    const base64 = await FileSystem.readAsStringAsync(pdfUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const pdfBytes = base64ToBytes(base64);

    const pdfDoc = await PDFDocument.load(pdfBytes, {
      updateMetadata: false,
    });

    const xmpPacket = buildXmpPacket(meta);
    const xmpBytes = utf8Encode(xmpPacket);

    // Create an uncompressed metadata stream. PDF spec (32000-1:2008, 14.3.2)
    // strongly recommends metadata streams be filterless so tools can read
    // them without decoding the full PDF.
    const metadataStream = pdfDoc.context.stream(xmpBytes);
    metadataStream.dict.set(PDFName.of('Type'), PDFName.of('Metadata'));
    metadataStream.dict.set(PDFName.of('Subtype'), PDFName.of('XML'));

    const metadataRef = pdfDoc.context.register(metadataStream);
    pdfDoc.catalog.set(PDFName.of('Metadata'), metadataRef);

    const newBytes = await pdfDoc.save({ useObjectStreams: false });
    const newBase64 = bytesToBase64(newBytes);

    await FileSystem.writeAsStringAsync(pdfUri, newBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    logger.debug('invoice', 'XMP metadata embedded', {
      invoiceNumber: meta.invoice_number,
    });
  } catch (err) {
    // Metadata is a nice-to-have; never fail the share flow because of it.
    logger.warn('invoice', 'Failed to embed XMP metadata', {
      error: String(err),
    });
  }
}
