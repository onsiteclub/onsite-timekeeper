/**
 * Invoice Share - OnSite Timekeeper
 *
 * Orchestrates invoice sharing. When online, uploads a responsive hosted
 * page + PDF to Supabase Storage and shares the public link as text —
 * this works uniformly across WhatsApp, SMS, email, Slack, etc., and
 * renders properly on small screens. When offline (or upload fails),
 * falls back to the legacy local-file PDF share.
 *
 * The hosted page includes a "Download PDF" button for recipients who
 * still want the archivable file.
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
// HELPERS
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

function buildShareMessage(invoice: InvoiceDB, url: string): string {
  return `Invoice ${invoice.invoice_number}: ${url}`;
}

async function fallbackFileShare(invoice: InvoiceDB): Promise<void> {
  if (!invoice.pdf_uri) return;
  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(invoice.pdf_uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Share ${invoice.invoice_number}`,
      });
    }
  } catch (err) {
    logger.warn('invoice', 'Fallback file share failed', { error: String(err) });
  }
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Share an invoice as a hosted link (preferred) or fall back to the local
 * PDF file if the app is offline or upload fails.
 */
export async function shareInvoice(userId: string, invoice: InvoiceDB): Promise<void> {
  if (!invoice.pdf_uri) {
    logger.warn('invoice', 'Share skipped — no PDF URI on invoice');
    return;
  }

  // Resolve public URLs upfront so the "Download PDF" button in the hosted
  // HTML points at the correct location before we actually upload.
  const urls = getInvoicePublicUrls(userId, invoice.id);

  let html: string;
  try {
    html = assembleHostedHtml(userId, invoice, urls.pdfUrl);
  } catch (err) {
    logger.warn('invoice', 'Hosted HTML assembly failed', { error: String(err) });
    await fallbackFileShare(invoice);
    return;
  }

  const published = await publishInvoiceFiles({
    userId,
    invoiceId: invoice.id,
    html,
    pdfUri: invoice.pdf_uri,
  });

  if (!published) {
    addSentryBreadcrumb('invoice', 'Share falling back to local file (publish failed)', {
      invoiceNumber: invoice.invoice_number,
    });
    await fallbackFileShare(invoice);
    return;
  }

  try {
    await Share.share({
      message: buildShareMessage(invoice, published.htmlUrl),
      // iOS forwards `url` to apps that accept URLs; Android ignores it and
      // uses `message`. Our message already contains the link so both paths
      // converge on the same result.
      url: published.htmlUrl,
      title: `Invoice ${invoice.invoice_number}`,
    });
    addSentryBreadcrumb('invoice', 'Invoice shared via hosted link', {
      invoiceNumber: invoice.invoice_number,
    });
  } catch (err) {
    logger.warn('invoice', 'Link share failed, falling back to file', { error: String(err) });
    await fallbackFileShare(invoice);
  }
}
