/**
 * Timesheet PDF Generator - OnSite Timekeeper
 *
 * Generates professional PDF timesheets from work sessions.
 * Uses expo-print to create HTML-based PDFs.
 * Falls back to text-based sharing if native module not available.
 *
 * Design inspired by standard construction/labor timesheets:
 * - Clean table format
 * - GPS verification badges
 * - Daily breakdown with totals
 * - Professional header/footer
 */

import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { Share, Alert } from 'react-native';
import { formatDuration, type ComputedSession } from './database';

// Dynamic import for expo-print (may not be available without rebuild)
let Print: typeof import('expo-print') | null = null;
try {
  Print = require('expo-print');
} catch (e) {
  console.log('expo-print not available, will use text fallback');
}

// ============================================
// TYPES
// ============================================

export interface TimesheetOptions {
  employeeName: string;
  employeeId?: string;
  companyName?: string;
  periodStart: Date;
  periodEnd: Date;
}

interface DayRow {
  date: Date;
  dateFormatted: string;
  dayName: string;
  locationName: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  totalMinutes: number;
  isVerified: boolean; // GPS verified
  isManual: boolean;
  sessionsCount: number;
}

// ============================================
// HELPERS
// ============================================

function formatTime12h(date: Date): string {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
  });
}

function formatDateLong(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function getDayName(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function formatHoursDecimal(minutes: number): string {
  const hours = minutes / 60;
  return hours.toFixed(2);
}

function formatHoursHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ============================================
// AGGREGATE SESSIONS BY DAY
// ============================================

function aggregateSessionsByDay(sessions: ComputedSession[]): DayRow[] {
  // Group sessions by date
  const byDate = new Map<string, ComputedSession[]>();

  for (const session of sessions) {
    if (!session.exit_at) continue; // Skip incomplete sessions

    const entryDate = new Date(session.entry_at);
    const dateKey = entryDate.toISOString().split('T')[0]; // YYYY-MM-DD

    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, []);
    }
    byDate.get(dateKey)!.push(session);
  }

  // Convert to DayRow array
  const rows: DayRow[] = [];

  for (const [dateKey, daySessions] of byDate.entries()) {
    // Sort sessions by entry time
    const sorted = [...daySessions].sort((a, b) =>
      new Date(a.entry_at).getTime() - new Date(b.entry_at).getTime()
    );

    const date = new Date(dateKey + 'T12:00:00'); // Noon to avoid timezone issues
    const firstEntry = new Date(sorted[0].entry_at);
    const lastExit = new Date(sorted[sorted.length - 1].exit_at!);

    // Aggregate totals
    let totalMinutes = 0;
    let totalBreak = 0;
    let isVerified = true; // True if ALL sessions are GPS
    let hasManual = false;
    const locationNames = new Set<string>();

    for (const s of sorted) {
      const pause = s.pause_minutes || 0;
      totalMinutes += Math.max(0, s.duration_minutes - pause);
      totalBreak += pause;
      locationNames.add(s.location_name || 'Unknown');

      if (s.type === 'manual' || s.manually_edited === 1) {
        hasManual = true;
        isVerified = false;
      }
    }

    rows.push({
      date,
      dateFormatted: formatDateShort(date),
      dayName: getDayName(date),
      locationName: Array.from(locationNames).join(', '),
      startTime: formatTime12h(firstEntry),
      endTime: formatTime12h(lastExit),
      breakMinutes: totalBreak,
      totalMinutes,
      isVerified: isVerified && !hasManual,
      isManual: hasManual,
      sessionsCount: sorted.length,
    });
  }

  // Sort by date
  return rows.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ============================================
// HTML TEMPLATE
// ============================================

function generateTimesheetHTML(
  sessions: ComputedSession[],
  options: TimesheetOptions
): string {
  const rows = aggregateSessionsByDay(sessions);

  // Calculate totals
  const grandTotalMinutes = rows.reduce((acc, r) => acc + r.totalMinutes, 0);
  const grandTotalBreak = rows.reduce((acc, r) => acc + r.breakMinutes, 0);
  const daysWorked = rows.length;
  const gpsVerified = rows.filter(r => r.isVerified).length;
  const manualEntries = rows.filter(r => r.isManual).length;

  // Format period
  const periodStr = `${formatDateLong(options.periodStart)} - ${formatDateLong(options.periodEnd)}`;

  // Generate table rows
  const tableRows = rows.map(row => `
    <tr>
      <td class="date-col">
        <div class="date-main">${row.dateFormatted}</div>
        <div class="date-day">${row.dayName}</div>
      </td>
      <td class="location-col">
        ${row.locationName}
        ${row.sessionsCount > 1 ? `<span class="sessions-badge">${row.sessionsCount}x</span>` : ''}
      </td>
      <td class="time-col">${row.startTime}</td>
      <td class="time-col">${row.endTime}</td>
      <td class="break-col">${row.breakMinutes > 0 ? `${row.breakMinutes}m` : '-'}</td>
      <td class="total-col">
        <span class="hours-value">${formatHoursHM(row.totalMinutes)}</span>
        <span class="hours-decimal">(${formatHoursDecimal(row.totalMinutes)})</span>
      </td>
      <td class="verify-col">
        ${row.isVerified
          ? '<span class="badge badge-gps">GPS</span>'
          : row.isManual
            ? '<span class="badge badge-manual">Manual</span>'
            : '<span class="badge badge-edited">Edited</span>'
        }
      </td>
    </tr>
  `).join('');

  // Generate reference code
  const now = new Date();
  const userPart = options.employeeId
    ? options.employeeId.replace(/-/g, '').slice(-4).toUpperCase()
    : '0000';
  const datePart = `${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}`;
  const refCode = `TS-${userPart}-${datePart}-${daysWorked.toString().padStart(2, '0')}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Timesheet - ${options.employeeName}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 11px;
      line-height: 1.4;
      color: #1a1a1a;
      background: #fff;
      padding: 20px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 2px solid #2563eb;
    }

    .header-left {
      flex: 1;
    }

    .company-name {
      font-size: 10px;
      font-weight: 500;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }

    .title {
      font-size: 22px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 4px;
    }

    .subtitle {
      font-size: 12px;
      color: #6b7280;
    }

    .header-right {
      text-align: right;
    }

    .employee-name {
      font-size: 16px;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 4px;
    }

    .employee-id {
      font-size: 10px;
      color: #6b7280;
    }

    .period-box {
      background: #f3f4f6;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .period-label {
      font-size: 10px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .period-value {
      font-size: 12px;
      font-weight: 500;
      color: #1a1a1a;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }

    thead {
      background: #1e3a5f;
      color: #fff;
    }

    th {
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 10px 8px;
      text-align: left;
    }

    th:last-child {
      text-align: center;
    }

    tbody tr {
      border-bottom: 1px solid #e5e7eb;
    }

    tbody tr:hover {
      background: #f9fafb;
    }

    td {
      padding: 10px 8px;
      vertical-align: middle;
    }

    .date-col {
      width: 70px;
    }

    .date-main {
      font-weight: 600;
      color: #1a1a1a;
    }

    .date-day {
      font-size: 9px;
      color: #6b7280;
    }

    .location-col {
      max-width: 120px;
    }

    .sessions-badge {
      display: inline-block;
      background: #e5e7eb;
      color: #6b7280;
      font-size: 9px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      margin-left: 4px;
    }

    .time-col {
      width: 70px;
      font-weight: 500;
    }

    .break-col {
      width: 50px;
      color: #6b7280;
      text-align: center;
    }

    .total-col {
      width: 90px;
    }

    .hours-value {
      font-weight: 700;
      color: #1a1a1a;
    }

    .hours-decimal {
      font-size: 9px;
      color: #6b7280;
      margin-left: 4px;
    }

    .verify-col {
      width: 60px;
      text-align: center;
    }

    .badge {
      display: inline-block;
      font-size: 8px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .badge-gps {
      background: #dcfce7;
      color: #166534;
    }

    .badge-manual {
      background: #fef3c7;
      color: #92400e;
    }

    .badge-edited {
      background: #dbeafe;
      color: #1e40af;
    }

    .summary-section {
      display: flex;
      gap: 16px;
      margin-bottom: 20px;
    }

    .summary-card {
      flex: 1;
      background: #f3f4f6;
      border-radius: 8px;
      padding: 12px 16px;
      text-align: center;
    }

    .summary-card.primary {
      background: #2563eb;
      color: #fff;
    }

    .summary-label {
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      margin-bottom: 4px;
    }

    .summary-card.primary .summary-label {
      color: rgba(255,255,255,0.7);
    }

    .summary-value {
      font-size: 18px;
      font-weight: 700;
      color: #1a1a1a;
    }

    .summary-card.primary .summary-value {
      color: #fff;
    }

    .summary-sub {
      font-size: 10px;
      color: #6b7280;
      margin-top: 2px;
    }

    .summary-card.primary .summary-sub {
      color: rgba(255,255,255,0.7);
    }

    .footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
    }

    .signature-area {
      flex: 1;
    }

    .signature-line {
      width: 200px;
      border-bottom: 1px solid #1a1a1a;
      margin-bottom: 4px;
      height: 30px;
    }

    .signature-label {
      font-size: 9px;
      color: #6b7280;
    }

    .footer-right {
      text-align: right;
    }

    .ref-code {
      font-size: 10px;
      font-weight: 600;
      color: #6b7280;
      font-family: monospace;
    }

    .generated {
      font-size: 9px;
      color: #9ca3af;
      margin-top: 4px;
    }

    .legend {
      display: flex;
      gap: 16px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 9px;
      color: #6b7280;
    }

    .app-name {
      font-size: 10px;
      font-weight: 500;
      color: #2563eb;
      margin-top: 8px;
    }

    @media print {
      body {
        padding: 0;
      }

      .header {
        page-break-after: avoid;
      }

      table {
        page-break-inside: auto;
      }

      tr {
        page-break-inside: avoid;
        page-break-after: auto;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      ${options.companyName ? `<div class="company-name">${options.companyName}</div>` : ''}
      <div class="title">Timesheet</div>
      <div class="subtitle">Work Hours Report</div>
    </div>
    <div class="header-right">
      <div class="employee-name">${options.employeeName}</div>
      ${options.employeeId ? `<div class="employee-id">ID: ${options.employeeId.slice(-8).toUpperCase()}</div>` : ''}
    </div>
  </div>

  <div class="period-box">
    <div>
      <div class="period-label">Period</div>
      <div class="period-value">${periodStr}</div>
    </div>
    <div style="text-align: right;">
      <div class="period-label">Days Worked</div>
      <div class="period-value">${daysWorked} day${daysWorked !== 1 ? 's' : ''}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Location</th>
        <th>Start</th>
        <th>End</th>
        <th>Break</th>
        <th>Total</th>
        <th>Type</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <div class="summary-section">
    <div class="summary-card primary">
      <div class="summary-label">Total Hours</div>
      <div class="summary-value">${formatHoursHM(grandTotalMinutes)}</div>
      <div class="summary-sub">${formatHoursDecimal(grandTotalMinutes)} decimal</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Total Break</div>
      <div class="summary-value">${grandTotalBreak}m</div>
      <div class="summary-sub">${formatHoursDecimal(grandTotalBreak)} hours</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">GPS Verified</div>
      <div class="summary-value">${gpsVerified}</div>
      <div class="summary-sub">of ${daysWorked} days</div>
    </div>
    ${manualEntries > 0 ? `
    <div class="summary-card">
      <div class="summary-label">Manual Entries</div>
      <div class="summary-value">${manualEntries}</div>
      <div class="summary-sub">not verified</div>
    </div>
    ` : ''}
  </div>

  <div class="footer">
    <div class="signature-area">
      <div class="signature-line"></div>
      <div class="signature-label">Employee Signature</div>
    </div>
    <div class="signature-area">
      <div class="signature-line"></div>
      <div class="signature-label">Supervisor Signature</div>
    </div>
    <div class="footer-right">
      <div class="ref-code">Ref: ${refCode}</div>
      <div class="generated">Generated: ${new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}</div>
      <div class="app-name">OnSite Timekeeper</div>
    </div>
  </div>

  <div class="legend">
    <div class="legend-item">
      <span class="badge badge-gps">GPS</span>
      <span>Location verified by GPS</span>
    </div>
    <div class="legend-item">
      <span class="badge badge-manual">Manual</span>
      <span>Entered manually (unverified)</span>
    </div>
    <div class="legend-item">
      <span class="badge badge-edited">Edited</span>
      <span>GPS entry was edited</span>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// ============================================
// TEXT REPORT GENERATOR (Fallback)
// ============================================

function generateTimesheetText(
  sessions: ComputedSession[],
  options: TimesheetOptions
): string {
  const rows = aggregateSessionsByDay(sessions);
  const lines: string[] = [];

  // Header
  lines.push('═══════════════════════════════════');
  lines.push('         TIMESHEET REPORT');
  lines.push('═══════════════════════════════════');
  lines.push('');
  lines.push(`Employee: ${options.employeeName}`);
  if (options.employeeId) {
    lines.push(`ID: ${options.employeeId.slice(-8).toUpperCase()}`);
  }
  lines.push(`Period: ${formatDateLong(options.periodStart)} - ${formatDateLong(options.periodEnd)}`);
  lines.push('');
  lines.push('───────────────────────────────────');

  // Calculate totals
  let grandTotalMinutes = 0;
  let grandTotalBreak = 0;

  // Each day
  for (const row of rows) {
    const verifyBadge = row.isVerified ? '✓ GPS' : row.isManual ? '⚠ Manual' : '✎ Edited';

    lines.push('');
    lines.push(`📅 ${row.dateFormatted} (${row.dayName})`);
    lines.push(`📍 ${row.locationName}`);
    lines.push(`⏰ ${row.startTime} → ${row.endTime}`);
    if (row.breakMinutes > 0) {
      lines.push(`☕ Break: ${row.breakMinutes}min`);
    }
    lines.push(`${verifyBadge} │ Total: ${formatHoursHM(row.totalMinutes)}`);

    grandTotalMinutes += row.totalMinutes;
    grandTotalBreak += row.breakMinutes;
  }

  // Footer
  lines.push('');
  lines.push('═══════════════════════════════════');
  lines.push(`TOTAL HOURS: ${formatHoursHM(grandTotalMinutes)} (${formatHoursDecimal(grandTotalMinutes)} decimal)`);
  lines.push(`TOTAL BREAK: ${grandTotalBreak}min`);
  lines.push(`DAYS WORKED: ${rows.length}`);
  lines.push('═══════════════════════════════════');
  lines.push('');
  lines.push('✓ GPS = Location verified');
  lines.push('⚠ Manual = Entered manually');
  lines.push('');
  lines.push('OnSite Timekeeper');
  lines.push(`Generated: ${new Date().toLocaleString()}`);

  return lines.join('\n');
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Generate and share a PDF timesheet
 * Falls back to text if expo-print not available
 */
export async function generateAndShareTimesheetPDF(
  sessions: ComputedSession[],
  options: TimesheetOptions
): Promise<void> {
  try {
    // Filter only completed sessions within period
    const filteredSessions = sessions.filter(s => {
      if (!s.exit_at) return false;
      const entryDate = new Date(s.entry_at);
      return entryDate >= options.periodStart && entryDate <= options.periodEnd;
    });

    if (filteredSessions.length === 0) {
      throw new Error('No completed sessions in this period');
    }

    // Check if expo-print is available
    if (!Print) {
      // Fallback to text-based sharing
      console.log('expo-print not available, using text fallback');
      const textReport = generateTimesheetText(filteredSessions, options);

      // Offer options: Share or Save as file
      return new Promise((resolve, reject) => {
        Alert.alert(
          'Share Timesheet',
          'PDF generation requires app rebuild. Would you like to share as text instead?',
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => resolve(),
            },
            {
              text: 'Share Text',
              onPress: async () => {
                try {
                  await Share.share({
                    message: textReport,
                    title: `Timesheet - ${options.employeeName}`,
                  });
                  resolve();
                } catch (e) {
                  reject(e);
                }
              },
            },
            {
              text: 'Save File',
              onPress: async () => {
                try {
                  const fileName = `Timesheet_${options.employeeName.replace(/\s+/g, '_')}_${formatDateShort(options.periodStart).replace(/\//g, '-')}.txt`;
                  const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

                  await FileSystem.writeAsStringAsync(fileUri, textReport, {
                    encoding: FileSystem.EncodingType.UTF8,
                  });

                  if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(fileUri, {
                      mimeType: 'text/plain',
                      dialogTitle: 'Save Timesheet',
                    });
                  }
                  resolve();
                } catch (e) {
                  reject(e);
                }
              },
            },
          ]
        );
      });
    }

    // Generate HTML
    const html = generateTimesheetHTML(filteredSessions, options);

    // Generate PDF
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    // Rename file to something meaningful
    const fileName = `Timesheet_${options.employeeName.replace(/\s+/g, '_')}_${formatDateShort(options.periodStart).replace(/\//g, '-')}.pdf`;
    const newUri = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.moveAsync({
      from: uri,
      to: newUri,
    });

    // Share the PDF
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(newUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Share Timesheet',
        UTI: 'com.adobe.pdf',
      });
    }
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
}

/**
 * Generate PDF and return the file URI (for preview)
 * Returns text file URI if expo-print not available
 */
export async function generateTimesheetPDFUri(
  sessions: ComputedSession[],
  options: TimesheetOptions
): Promise<string> {
  // Filter only completed sessions within period
  const filteredSessions = sessions.filter(s => {
    if (!s.exit_at) return false;
    const entryDate = new Date(s.entry_at);
    return entryDate >= options.periodStart && entryDate <= options.periodEnd;
  });

  if (filteredSessions.length === 0) {
    throw new Error('No completed sessions in this period');
  }

  // Check if expo-print is available
  if (!Print) {
    // Fallback: create text file
    const textReport = generateTimesheetText(filteredSessions, options);
    const fileName = `Timesheet_${options.employeeName.replace(/\s+/g, '_')}.txt`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(fileUri, textReport, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    return fileUri;
  }

  // Generate HTML
  const html = generateTimesheetHTML(filteredSessions, options);

  // Generate PDF
  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
  });

  return uri;
}

/**
 * Print timesheet directly (opens system print dialog)
 * Shows text in alert if expo-print not available
 */
export async function printTimesheet(
  sessions: ComputedSession[],
  options: TimesheetOptions
): Promise<void> {
  // Filter only completed sessions within period
  const filteredSessions = sessions.filter(s => {
    if (!s.exit_at) return false;
    const entryDate = new Date(s.entry_at);
    return entryDate >= options.periodStart && entryDate <= options.periodEnd;
  });

  if (filteredSessions.length === 0) {
    throw new Error('No completed sessions in this period');
  }

  // Check if expo-print is available
  if (!Print) {
    const textReport = generateTimesheetText(filteredSessions, options);
    Alert.alert('Print Preview', 'PDF print requires app rebuild.\n\n' + textReport.substring(0, 500) + '...');
    return;
  }

  // Generate HTML
  const html = generateTimesheetHTML(filteredSessions, options);

  // Open print dialog
  await Print.printAsync({ html });
}
