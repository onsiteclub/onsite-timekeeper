/**
 * Invoice Share - OnSite Timekeeper
 *
 * Two user-facing share flows:
 *
 *   shareInvoiceLink(userId, invoice)
 *     Uploads a responsive HTML viewer + the PDF to Supabase Storage,
 *     registers a short slug, and shares the short URL via the native
 *     text-share sheet. URL appears exactly once in the message (no rich
 *     preview duplication).
 *
 *   shareInvoicePdf(invoice)
 *     Shares the local PDF file via the native file-share sheet.
 *     Recipient receives the PDF as an attachment.
 *
 * The UI presents these as two explicit buttons ("Share link" / "Share
 * PDF") so the user chooses in each context — there's no way to send
 * both text+file in a single native share action on RN.
 */

import { Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import { getInvoiceItems } from './database/invoices';
import { getDailyHoursByPeriod } from './database/daily';
import { getClientByName } from './database/clients';
import type { DailyHoursDB, InvoiceDB } from './database/core';
import { generateHostedInvoiceHTML } from './invoiceHostedHtml';
import type { ClientAddressForPDF } from './invoicePdf';
import { getInvoicePublicUrls, publishInvoiceFiles } from './invoicePublish';
import { useBusinessProfileStore } from '../stores/businessProfileStore';
import { logger } from './logger';
import { addSentryBreadcrumb } from './sentry';

// ============================================
// HTML ASSEMBLY
// ============================================

function buildClientAddress(userId: string, invoice: InvoiceDB): ClientAddressForPDF | null {
  if (!invoice.client_name) return null;
  const client = getClientByName(userId, invoice.client_name);
  if (!client) return null;
  return {
    street: client.address_street || '',
    city: client.address_city || '',
    province: client.address_province || '',
    postalCode: client.address_postal_code || '',
    email: client.email || null,
    phone: client.phone || null,
  };
}

function assembleHostedHtml(
  userId: string,
  invoice: InvoiceDB,
  pdfUrl: string | null,
): string {
  const businessProfile = useBusinessProfileStore.getState().profile ?? null;
  const clientAddress = buildClientAddress(userId, invoice);

  if (invoice.type === 'products_services') {
    const items = getInvoiceItems(invoice.id);
    return generateHostedInvoiceHTML({
      invoice,
      businessProfile,
      clientAddress,
      items,
      pdfUrl,
    });
  }

  const days =
    invoice.period_start && invoice.period_end
      ? (getDailyHoursByPeriod(userId, invoice.period_start, invoice.period_end) as unknown as DailyHoursDB[])
      : [];

  return generateHostedInvoiceHTML({
    invoice,
    businessProfile,
    clientAddress,
    days,
    pdfUrl,
  });
}

// ============================================
// PUBLIC API — LINK SHARE
// ============================================

/**
 * Upload the hosted viewer + PDF and share a short link via the native
 * text-share sheet. Returns true on successful share, false otherwise.
 *
 * On upload failure, falls back to sharing the local PDF so the user
 * still gets SOMETHING out the door.
 */
export async function shareInvoiceLink(userId: string, invoice: InvoiceDB): Promise<boolean> {
  if (!invoice.pdf_uri) {
    logger.warn('invoice', 'shareInvoiceLink skipped — no PDF URI on invoice');
    return false;
  }

  // Pre-resolve the long public URLs so the "Download PDF" button inside
  // the HTML template points at the correct location before upload.
  const urls = getInvoicePublicUrls(userId, invoice.id);

  let html: string;
  try {
    html = assembleHostedHtml(userId, invoice, urls.pdfUrl);
  } catch (err) {
    logger.warn('invoice', 'Hosted HTML assembly failed', { error: String(err) });
    return shareInvoicePdf(invoice);
  }

  const published = await publishInvoiceFiles({
    userId,
    invoiceId: invoice.id,
    html,
    pdfUri: invoice.pdf_uri,
  });

  if (!published) {
    addSentryBreadcrumb('invoice', 'Share link falling back to PDF file (publish failed)', {
      invoiceNumber: invoice.invoice_number,
    });
    return shareInvoicePdf(invoice);
  }

  try {
    // Put the URL in `message` ONLY. Do NOT pass the `url` prop — iOS
    // apps append it as a rich preview and it shows up twice in WhatsApp.
    await Share.share({
      message: `Invoice ${invoice.invoice_number}\n${published.shortUrl}`,
      title: `Invoice ${invoice.invoice_number}`,
    });
    addSentryBreadcrumb('invoice', 'Invoice link shared', {
      invoiceNumber: invoice.invoice_number,
    });
    return true;
  } catch (err) {
    logger.warn('invoice', 'Link share failed, falling back to PDF file', { error: String(err) });
    return shareInvoicePdf(invoice);
  }
}

// ============================================
// PUBLIC API — PDF FILE SHARE
// ============================================

/**
 * Share the local PDF file via the native file-share sheet. Works
 * offline. Returns true on success.
 */
export async function shareInvoicePdf(invoice: InvoiceDB): Promise<boolean> {
  if (!invoice.pdf_uri) {
    logger.warn('invoice', 'shareInvoicePdf skipped — no PDF URI on invoice');
    return false;
  }
  try {
    if (!(await Sharing.isAvailableAsync())) {
      logger.warn('invoice', 'Native file sharing not available');
      return false;
    }
    await Sharing.shareAsync(invoice.pdf_uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Share ${invoice.invoice_number}`,
    });
    addSentryBreadcrumb('invoice', 'Invoice PDF file shared', {
      invoiceNumber: invoice.invoice_number,
    });
    return true;
  } catch (err) {
    logger.warn('invoice', 'PDF file share failed', { error: String(err) });
    return false;
  }
}

// ============================================
// BACKWARD-COMPAT SHIM
// ============================================

/**
 * Legacy single-button share. Tries the link first, falls back to PDF.
 * Kept so call sites that haven't been updated to the dual-button UI
 * still compile; new code should call shareInvoiceLink / shareInvoicePdf
 * explicitly.
 */
export async function shareInvoice(userId: string, invoice: InvoiceDB): Promise<void> {
  await shareInvoiceLink(userId, invoice);
}
