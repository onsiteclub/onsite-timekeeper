/**
 * Invoice Share - OnSite Timekeeper
 *
 * Hands the local invoice PDF to the OS share sheet via expo-sharing.
 * Recipient apps (WhatsApp, email, Files, Drive, etc.) get a regular
 * PDF attachment named after the invoice number.
 *
 * The hosted-link / responsive-HTML viewer was removed in build 50:
 * supabase.co's `text/plain` + sandbox CSP on public-bucket HTML made
 * the viewer unworkable from a Storage URL, and the workaround
 * (custom domain + edge function proxy) added too much infra for the
 * payoff. Going back to plain PDF until there's a real reason to host.
 */

import * as Sharing from 'expo-sharing';
import type { InvoiceDB } from './database/core';
import { logger } from './logger';
import { addSentryBreadcrumb } from './sentry';

/**
 * Open the system share sheet with the invoice PDF attached. Returns
 * true when the sheet was presented (the user may still cancel from
 * inside it), false on setup failure.
 *
 * The userId param is unused right now — kept in the signature so call
 * sites don't churn if the hosted-link flow ever comes back.
 */
export async function shareInvoice(_userId: string, invoice: InvoiceDB): Promise<boolean> {
  if (!invoice.pdf_uri) {
    logger.warn('invoice', 'shareInvoice skipped — no PDF URI on invoice');
    return false;
  }
  try {
    if (!(await Sharing.isAvailableAsync())) {
      logger.warn('invoice', 'Native sharing not available');
      return false;
    }
    await Sharing.shareAsync(invoice.pdf_uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Share ${invoice.invoice_number}`,
      UTI: 'com.adobe.pdf',
    });
    addSentryBreadcrumb('invoice', 'Invoice PDF shared', {
      invoiceNumber: invoice.invoice_number,
    });
    return true;
  } catch (err) {
    logger.warn('invoice', 'Invoice share failed', { error: String(err) });
    return false;
  }
}
