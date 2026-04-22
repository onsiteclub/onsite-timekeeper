/**
 * Hosted Invoice HTML - OnSite Timekeeper
 *
 * Generates a responsive, mobile-first HTML page for viewing invoices
 * online. This is the page recipients see when they tap the invoice link
 * shared via WhatsApp, SMS, email, etc. It's separate from the PDF
 * template because PDFs are fixed-layout and look bad on small screens.
 *
 * The page includes a prominent "Download PDF" button for users who
 * still want the archivable file.
 */

import type {
  BusinessProfileDB,
  DailyHoursDB,
  InvoiceDB,
  InvoiceItemDB,
} from './database/core';
import type { ClientAddressForPDF } from './invoicePdf';

// ============================================
// HELPERS
// ============================================

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(n: number): string {
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}

function formatHoursHM(minutes: number): string {
  if (minutes <= 0) return '0h';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateLong(date: Date): string {
  return date.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ============================================
// RESPONSIVE HTML TEMPLATE
// ============================================

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    color: #1f2937;
    background: #f3f4f6;
    -webkit-font-smoothing: antialiased;
  }
  .page { max-width: 720px; margin: 0 auto; padding: 16px; }

  .card {
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
    margin-bottom: 16px;
    overflow: hidden;
  }
  .card-body { padding: 20px; }

  .brand-bar {
    background: #1a365d;
    color: #fff;
    padding: 24px 20px;
  }
  .brand-name {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }
  .brand-sub {
    font-size: 12px;
    opacity: 0.8;
    margin-top: 4px;
  }
  .brand-contact {
    font-size: 11px;
    opacity: 0.75;
    margin-top: 8px;
    line-height: 1.6;
  }

  .invoice-title {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 2px;
    color: #6b7280;
    text-transform: uppercase;
  }
  .invoice-number {
    font-size: 28px;
    font-weight: 700;
    color: #1a365d;
    margin-top: 4px;
  }
  .invoice-meta {
    margin-top: 12px;
    font-size: 13px;
    color: #6b7280;
    line-height: 1.7;
  }
  .invoice-meta strong { color: #1f2937; }

  .bill-to-label {
    font-size: 11px;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 6px;
  }
  .bill-to-name {
    font-size: 16px;
    font-weight: 600;
    color: #1a365d;
  }
  .bill-to-line {
    font-size: 13px;
    color: #4b5563;
    margin-top: 2px;
  }

  .section-title {
    font-size: 11px;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin: 16px 0 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid #e5e7eb;
  }

  /* Desktop table */
  table.desktop-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .desktop-table th {
    text-align: left;
    font-weight: 600;
    color: #6b7280;
    padding: 10px 8px;
    border-bottom: 1px solid #e5e7eb;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .desktop-table th.num, .desktop-table td.num { text-align: right; }
  .desktop-table th.ctr, .desktop-table td.ctr { text-align: center; }
  .desktop-table td {
    padding: 10px 8px;
    border-bottom: 1px solid #f3f4f6;
    vertical-align: middle;
  }

  /* Mobile card list (shown on small screens) */
  .mobile-list { display: none; }
  .row-card {
    background: #f9fafb;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 8px;
    font-size: 13px;
  }
  .row-card .row-title {
    font-weight: 600;
    color: #1a365d;
    margin-bottom: 6px;
  }
  .row-card .row-line {
    display: flex;
    justify-content: space-between;
    color: #4b5563;
    font-size: 12px;
    padding: 2px 0;
  }
  .row-card .row-total {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #e5e7eb;
    font-weight: 600;
    color: #1f2937;
  }

  .totals {
    margin-top: 16px;
    border-top: 2px solid #1a365d;
    padding-top: 12px;
  }
  .total-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 14px;
    color: #4b5563;
  }
  .total-row.grand {
    margin-top: 8px;
    padding-top: 12px;
    border-top: 1px solid #e5e7eb;
    font-size: 18px;
    font-weight: 700;
    color: #1a365d;
  }

  .notes {
    margin-top: 16px;
    padding: 12px 14px;
    background: #f9fafb;
    border-left: 3px solid #1a365d;
    border-radius: 4px;
    font-size: 13px;
    color: #4b5563;
    white-space: pre-wrap;
    line-height: 1.5;
  }

  .download-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 16px 20px;
    background: #1a365d;
    color: #fff;
    text-decoration: none;
    font-size: 16px;
    font-weight: 600;
    border-radius: 12px;
    border: none;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(26,54,93,0.3);
  }
  .download-btn:active { opacity: 0.85; }
  .download-btn svg { width: 20px; height: 20px; }

  .footer {
    text-align: center;
    padding: 24px 16px;
    font-size: 11px;
    color: #9ca3af;
    line-height: 1.6;
  }

  /* ===== MOBILE ===== */
  @media (max-width: 560px) {
    .page { padding: 8px; }
    .card-body { padding: 16px; }
    .brand-bar { padding: 20px 16px; }
    .invoice-number { font-size: 24px; }
    .desktop-table { display: none; }
    .mobile-list { display: block; }
    .total-row { font-size: 13px; }
    .total-row.grand { font-size: 16px; }
  }
`;

// ============================================
// DOWNLOAD BUTTON
// ============================================

function buildDownloadButton(pdfUrl: string | null | undefined): string {
  if (!pdfUrl) return '';
  return `
    <div class="card">
      <div class="card-body">
        <a href="${escapeHtml(pdfUrl)}" class="download-btn" download>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>Download PDF</span>
        </a>
      </div>
    </div>
  `;
}

// ============================================
// HEADER BLOCKS
// ============================================

function buildLetterhead(bp: BusinessProfileDB | null): string {
  if (!bp) {
    return `
      <div class="brand-bar">
        <div class="brand-name">INVOICE</div>
      </div>
    `;
  }
  const addr = [bp.address_street, bp.address_city, bp.address_province, bp.address_postal_code]
    .filter(Boolean)
    .join(', ');
  const contact = [
    bp.phone ? `Tel: ${escapeHtml(bp.phone)}` : '',
    bp.email ? `Email: ${escapeHtml(bp.email)}` : '',
    bp.business_number ? `BN: ${escapeHtml(bp.business_number)}` : '',
    bp.gst_hst_number ? `GST/HST: ${escapeHtml(bp.gst_hst_number)}` : '',
  ].filter(Boolean).join(' &nbsp;|&nbsp; ');
  return `
    <div class="brand-bar">
      <div class="brand-name">${escapeHtml(bp.business_name)}</div>
      ${addr ? `<div class="brand-sub">${escapeHtml(addr)}</div>` : ''}
      ${contact ? `<div class="brand-contact">${contact}</div>` : ''}
    </div>
  `;
}

function buildInvoiceHeader(invoice: InvoiceDB, periodLabel: string | null): string {
  const issued = new Date(invoice.created_at.includes('T') ? invoice.created_at : invoice.created_at.replace(' ', 'T') + 'Z');
  const dueText = invoice.due_date
    ? formatDateLong(new Date(invoice.due_date + 'T12:00:00'))
    : formatDateLong(new Date(issued.getTime() + 30 * 24 * 60 * 60 * 1000));
  return `
    <div class="card-body">
      <div class="invoice-title">Invoice</div>
      <div class="invoice-number">${escapeHtml(invoice.invoice_number)}</div>
      <div class="invoice-meta">
        <div>Issued: <strong>${formatDateLong(issued)}</strong></div>
        ${periodLabel ? `<div>Period: <strong>${periodLabel}</strong></div>` : ''}
        <div>Due: <strong>${dueText}</strong></div>
      </div>
    </div>
  `;
}

function buildBillTo(clientName: string, addr: ClientAddressForPDF | null | undefined): string {
  const lines: string[] = [];
  if (addr) {
    if (addr.street) lines.push(`<div class="bill-to-line">${escapeHtml(addr.street)}</div>`);
    const cityLine = [addr.city, addr.province, addr.postalCode].filter(Boolean).join(', ');
    if (cityLine) lines.push(`<div class="bill-to-line">${escapeHtml(cityLine)}</div>`);
    if (addr.email) lines.push(`<div class="bill-to-line">${escapeHtml(addr.email)}</div>`);
    if (addr.phone) lines.push(`<div class="bill-to-line">${escapeHtml(addr.phone)}</div>`);
  }
  return `
    <div class="card-body" style="border-top: 1px solid #f3f4f6;">
      <div class="bill-to-label">Bill To</div>
      <div class="bill-to-name">${escapeHtml(clientName)}</div>
      ${lines.join('')}
    </div>
  `;
}

// ============================================
// BODY: HOURLY
// ============================================

function buildHourlyBody(
  days: DailyHoursDB[],
  hourlyRate: number,
  taxRate: number,
  businessProfile: BusinessProfileDB | null,
): string {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  let totalMinutes = 0;
  let subtotal = 0;

  const desktopRows = sorted.map(d => {
    const hours = d.total_minutes / 60;
    const amount = hours * hourlyRate;
    totalMinutes += d.total_minutes;
    subtotal += amount;
    return `
      <tr>
        <td>${formatDateShort(d.date)}</td>
        <td class="ctr">${escapeHtml(d.first_entry || '')}</td>
        <td class="ctr">${escapeHtml(d.last_exit || '')}</td>
        <td class="ctr">${formatHoursHM(d.total_minutes)}</td>
        <td class="num">${formatMoney(amount)}</td>
      </tr>
    `;
  }).join('');

  // Reset and rebuild mobile list (totals already computed).
  const mobileRows = sorted.map(d => {
    const hours = d.total_minutes / 60;
    const amount = hours * hourlyRate;
    return `
      <div class="row-card">
        <div class="row-title">${formatDateShort(d.date)}</div>
        <div class="row-line"><span>Start</span><span>${escapeHtml(d.first_entry || '—')}</span></div>
        <div class="row-line"><span>End</span><span>${escapeHtml(d.last_exit || '—')}</span></div>
        <div class="row-line"><span>Hours</span><span>${formatHoursHM(d.total_minutes)}</span></div>
        <div class="row-total"><span>Amount</span><span>${formatMoney(amount)}</span></div>
      </div>
    `;
  }).join('');

  const taxAmount = subtotal * (taxRate / 100);
  const grand = subtotal + taxAmount;
  const taxLabel = businessProfile?.gst_hst_number ? 'HST' : 'Tax';

  return `
    <div class="card-body">
      <div class="section-title">Hours breakdown</div>

      <table class="desktop-table">
        <thead>
          <tr>
            <th>Day</th>
            <th class="ctr">Start</th>
            <th class="ctr">End</th>
            <th class="ctr">Hours</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>${desktopRows}</tbody>
      </table>

      <div class="mobile-list">${mobileRows}</div>

      <div class="totals">
        <div class="total-row">
          <span>${sorted.length} days × ${formatMoney(hourlyRate)}/hr (${formatHoursHM(totalMinutes)})</span>
          <span>${formatMoney(subtotal)}</span>
        </div>
        ${taxRate > 0 ? `
        <div class="total-row">
          <span>${taxLabel} (${taxRate}%)</span>
          <span>${formatMoney(taxAmount)}</span>
        </div>
        ` : ''}
        <div class="total-row grand">
          <span>Total</span>
          <span>${formatMoney(grand)}</span>
        </div>
      </div>
    </div>
  `;
}

// ============================================
// BODY: PRODUCTS/SERVICES
// ============================================

function buildProductsBody(
  items: InvoiceItemDB[],
  taxRate: number,
  businessProfile: BusinessProfileDB | null,
): string {
  const subtotal = items.reduce((sum, i) => sum + (i.total || 0), 0);
  const taxAmount = subtotal * (taxRate / 100);
  const grand = subtotal + taxAmount;
  const taxLabel = businessProfile?.gst_hst_number ? 'HST' : 'Tax';

  const desktopRows = items.map((it, i) => `
    <tr>
      <td class="ctr">${i + 1}</td>
      <td>${escapeHtml(it.description)}</td>
      <td class="ctr">${it.quantity}</td>
      <td class="num">${formatMoney(it.unit_price ?? 0)}</td>
      <td class="num">${formatMoney(it.total ?? 0)}</td>
    </tr>
  `).join('');

  const mobileRows = items.map(it => `
    <div class="row-card">
      <div class="row-title">${escapeHtml(it.description)}</div>
      <div class="row-line"><span>Quantity</span><span>${it.quantity}</span></div>
      <div class="row-line"><span>Unit price</span><span>${formatMoney(it.unit_price ?? 0)}</span></div>
      <div class="row-total"><span>Amount</span><span>${formatMoney(it.total ?? 0)}</span></div>
    </div>
  `).join('');

  return `
    <div class="card-body">
      <div class="section-title">Items</div>

      <table class="desktop-table">
        <thead>
          <tr>
            <th class="ctr" style="width:32px;">#</th>
            <th>Description</th>
            <th class="ctr">Qty</th>
            <th class="num">Unit</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>${desktopRows}</tbody>
      </table>

      <div class="mobile-list">${mobileRows}</div>

      <div class="totals">
        <div class="total-row">
          <span>Subtotal</span>
          <span>${formatMoney(subtotal)}</span>
        </div>
        ${taxRate > 0 ? `
        <div class="total-row">
          <span>${taxLabel} (${taxRate}%)</span>
          <span>${formatMoney(taxAmount)}</span>
        </div>
        ` : ''}
        <div class="total-row grand">
          <span>Total</span>
          <span>${formatMoney(grand)}</span>
        </div>
      </div>
    </div>
  `;
}

// ============================================
// PUBLIC API
// ============================================

export interface HostedInvoiceParams {
  invoice: InvoiceDB;
  businessProfile: BusinessProfileDB | null;
  clientAddress: ClientAddressForPDF | null;
  days?: DailyHoursDB[];      // hourly invoices
  items?: InvoiceItemDB[];    // products invoices
  pdfUrl?: string | null;     // public URL for the "Download PDF" button
}

export function generateHostedInvoiceHTML(params: HostedInvoiceParams): string {
  const { invoice, businessProfile, clientAddress, days, items, pdfUrl } = params;

  const periodLabel =
    invoice.type === 'hourly' && invoice.period_start && invoice.period_end
      ? `${formatDateShort(invoice.period_start)} — ${formatDateShort(invoice.period_end)}`
      : null;

  const body =
    invoice.type === 'hourly'
      ? buildHourlyBody(days ?? [], invoice.hourly_rate || 0, invoice.tax_rate, businessProfile)
      : buildProductsBody(items ?? [], invoice.tax_rate, businessProfile);

  const notes = invoice.notes && invoice.notes.trim()
    ? `<div class="card"><div class="card-body"><div class="section-title">Notes</div><div class="notes">${escapeHtml(invoice.notes)}</div></div></div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Invoice ${escapeHtml(invoice.invoice_number)}</title>
<style>${CSS}</style>
</head>
<body>
  <div class="page">
    <div class="card">
      ${buildLetterhead(businessProfile)}
      ${buildInvoiceHeader(invoice, periodLabel)}
      ${buildBillTo(invoice.client_name || '', clientAddress)}
      ${body}
    </div>
    ${notes}
    ${buildDownloadButton(pdfUrl)}
    <div class="footer">
      Generated by OnSite Timekeeper · onsiteclub.ca
    </div>
  </div>
</body>
</html>`;
}
