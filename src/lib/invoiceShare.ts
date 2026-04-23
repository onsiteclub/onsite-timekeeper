/**
 * Invoice Share - OnSite Timekeeper
 *
 * ONE share action that hands the native share sheet BOTH the PDF file
 * AND the short link + invoice number as text. Using `react-native-share`
 * (v12) because React Native's built-in `Share.share` can only send text
 * OR file, not both.
 *
 * Typical recipient experience after the user shares to…
 *   WhatsApp  : message with PDF attached + caption line ("Invoice X + link")
 *   Email     : subject = "Invoice X", body has link, PDF attached
 *   SMS       : text with the short link (SMS can't carry attachments)
 *   Drive/etc.: saves the PDF file with the invoice-number filename
 *
 * The short link opens a responsive HTML viewer (via the `r` Edge
 * Function) with a "Download PDF" button — so recipients on channels
 * that can't render attachments (SMS) still have a way to get the PDF.
 *
 * Publish failures (offline, upload error) are degraded gracefully:
 * we still share the local PDF file, just without the link.
 */

import Share from 'react-native-share';
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
// HTML ASSEMBLY (for the hosted viewer)
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
// SHARE PAYLOAD HELPERS
// ============================================

function buildMessage(invoiceNumber: string, shortUrl: string | null): string {
  // Only include the URL when we actually have one. Keep on its own line
  // so apps with inline link detection (WhatsApp, iMessage) render it as
  // a tappable link rather than inline with the heading.
  return shortUrl
    ? `Invoice ${invoiceNumber}\n${shortUrl}`
    : `Invoice ${invoiceNumber}`;
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Share an invoice via the system share sheet. The payload always
 * includes the PDF as an attachment; when online, it also includes a
 * short link that opens a responsive HTML viewer.
 *
 * Returns true when the share sheet was presented (regardless of what
 * the user ultimately chose), false on setup failure (missing PDF,
 * native module error).
 */
export async function shareInvoice(userId: string, invoice: InvoiceDB): Promise<boolean> {
  if (!invoice.pdf_uri) {
    logger.warn('invoice', 'shareInvoice skipped — no PDF URI on invoice');
    return false;
  }

  // Try to publish HTML + PDF so we can include a short link. This is a
  // best-effort step; if it fails (offline, auth expired, upload error),
  // we still share the local PDF without a link.
  let shortUrl: string | null = null;
  try {
    const urls = getInvoicePublicUrls(userId, invoice.id);
    const html = assembleHostedHtml(userId, invoice, urls.pdfUrl);
    const published = await publishInvoiceFiles({
      userId,
      invoiceId: invoice.id,
      html,
      pdfUri: invoice.pdf_uri,
    });
    shortUrl = published?.shortUrl ?? null;
    if (!shortUrl) {
      addSentryBreadcrumb('invoice', 'Publish failed — sharing PDF without link', {
        invoiceNumber: invoice.invoice_number,
      });
    }
  } catch (err) {
    logger.warn('invoice', 'Hosted HTML assembly/publish failed', { error: String(err) });
  }

  const message = buildMessage(invoice.invoice_number, shortUrl);

  try {
    await Share.open({
      title: `Invoice ${invoice.invoice_number}`,
      subject: `Invoice ${invoice.invoice_number}`,
      message,
      url: invoice.pdf_uri,
      filename: `${invoice.invoice_number}.pdf`,
      type: 'application/pdf',
      failOnCancel: false,
    });
    addSentryBreadcrumb('invoice', 'Invoice shared', {
      invoiceNumber: invoice.invoice_number,
      hasLink: !!shortUrl,
    });
    return true;
  } catch (err) {
    logger.warn('invoice', 'Share sheet failed', { error: String(err) });
    return false;
  }
}
