/**
 * Timesheet PDF Generator - OnSite Timekeeper
 *
 * Generates professional PDF timesheets from work sessions.
 * Simple table format matching standard timesheet documents.
 */

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Share, Alert } from 'react-native';
import { type ComputedSession } from './database';

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

function getDayName(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
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
// SIMPLE TABLE GENERATOR (Main format)
// ============================================

// ============================================
// HTML TEMPLATE FOR PDF
// ============================================

function generateSimpleHTML(
  sessions: ComputedSession[],
  options: TimesheetOptions
): string {
  const rows = aggregateSessionsByDay(sessions);

  // Create map of day data by date key
  const rowsByDate = new Map<string, DayRow>();
  for (const row of rows) {
    const dateKey = row.date.toISOString().split('T')[0];
    rowsByDate.set(dateKey, row);
  }

  // Generate table rows for ALL days in period
  let grandTotalMinutes = 0;
  const tableRows: string[] = [];

  const currentDate = new Date(options.periodStart);
  currentDate.setHours(12, 0, 0, 0);
  const endDate = new Date(options.periodEnd);
  endDate.setHours(23, 59, 59, 999);

  while (currentDate <= endDate) {
    const dateKey = currentDate.toISOString().split('T')[0];
    const row = rowsByDate.get(dateKey);

    const day = currentDate.getDate().toString().padStart(2, '0');
    const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' });

    if (row) {
      const breakStr = row.breakMinutes > 0 ? `${row.breakMinutes}m` : '';
      tableRows.push(`
        <tr>
          <td class="day-col">${day} - ${dayName}</td>
          <td class="time-col">${row.startTime}</td>
          <td class="time-col">${row.endTime}</td>
          <td class="break-col">${breakStr}</td>
          <td class="total-col">${formatHoursHM(row.totalMinutes)}</td>
        </tr>
      `);
      grandTotalMinutes += row.totalMinutes;
    } else {
      tableRows.push(`
        <tr>
          <td class="day-col">${day} - ${dayName}</td>
          <td class="time-col"></td>
          <td class="time-col"></td>
          <td class="break-col"></td>
          <td class="total-col"></td>
        </tr>
      `);
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      font-size: 10px;
      padding: 40px 50px;
      color: #333;
    }

    /* ===== LETTERHEAD / COMPANY HEADER ===== */
    .letterhead {
      border-bottom: 3px solid #1a365d;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .company-name {
      font-size: 22px;
      font-weight: bold;
      color: #1a365d;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .company-subtitle {
      font-size: 9px;
      color: #666;
      margin-top: 4px;
      font-style: italic;
    }
    .company-info {
      margin-top: 8px;
      font-size: 8px;
      color: #888;
      line-height: 1.6;
    }

    /* ===== DOCUMENT TITLE ===== */
    .doc-title {
      text-align: center;
      margin: 30px 0;
    }
    .doc-title h1 {
      font-size: 16px;
      font-weight: 600;
      color: #1a365d;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    .doc-period {
      font-size: 10px;
      color: #666;
      margin-top: 8px;
    }

    /* ===== TABLE ===== */
    .table-container {
      max-width: 90%;
      margin: 0 auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
    }
    th {
      background: #f8f9fa;
      color: #1a365d;
      font-weight: 600;
      font-size: 9px;
      padding: 10px 8px;
      text-align: left;
      border-bottom: 2px solid #1a365d;
    }
    th:not(:first-child) {
      text-align: center;
    }
    td {
      padding: 8px;
      border-bottom: 1px solid #e9ecef;
      vertical-align: middle;
    }
    .day-col {
      font-weight: 500;
      color: #1a365d;
      width: 30%;
    }
    .time-col {
      text-align: center;
      width: 17%;
    }
    .break-col {
      text-align: center;
      width: 13%;
    }
    .total-col {
      text-align: center;
      width: 23%;
      font-weight: 500;
      background: #f8f9fa;
    }
    .total-row {
      background: #eef2ff;
      font-weight: bold;
    }
    .total-row td {
      border-top: 2px solid #1a365d;
      padding: 12px 8px;
    }
    .total-row .total-col {
      background: #dbeafe;
      color: #1a365d;
      font-size: 12px;
    }

    /* ===== FOOTER ===== */
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      font-size: 7px;
      color: #999;
      text-align: center;
    }
  </style>
</head>
<body>
  <!-- LETTERHEAD -->
  <div class="letterhead">
    <div class="company-name">${options.employeeName}</div>
    <div class="company-subtitle">Sole Proprietorship</div>
    <div class="company-info">
      <!-- Space for address, phone, email if needed -->
    </div>
  </div>

  <!-- DOCUMENT TITLE -->
  <div class="doc-title">
    <h1>Timesheet</h1>
    <div class="doc-period">Period: ${formatDateShort(options.periodStart)} - ${formatDateShort(options.periodEnd)}</div>
  </div>

  <!-- TABLE -->
  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>Day / Date</th>
          <th>Start time</th>
          <th>End Time</th>
          <th>Break</th>
          <th>Total Work Hours</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows.join('')}
        <tr class="total-row">
          <td colspan="4" style="text-align: right; padding-right: 20px;">TOTAL HOURS:</td>
          <td class="total-col">${formatHoursHM(grandTotalMinutes)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    Generated by OnSite Timekeeper
  </div>
</body>
</html>
  `.trim();
}

// ============================================
// TEXT TABLE (fallback)
// ============================================

function generateSimpleTable(
  sessions: ComputedSession[],
  options: TimesheetOptions
): string {
  const rows = aggregateSessionsByDay(sessions);
  const lines: string[] = [];

  // Create map of day data by date key (YYYY-MM-DD)
  const rowsByDate = new Map<string, DayRow>();
  for (const row of rows) {
    const dateKey = row.date.toISOString().split('T')[0];
    rowsByDate.set(dateKey, row);
  }

  // Header with employee name
  lines.push(`📋 ${options.employeeName}`);
  lines.push('');

  // Table header
  lines.push('┌─────────────────┬───────────┬───────────┬───────┬───────────┐');
  lines.push('│ Day / Date      │ Start     │ End       │ Break │ Total     │');
  lines.push('├─────────────────┼───────────┼───────────┼───────┼───────────┤');

  // Calculate totals
  let grandTotalMinutes = 0;

  // Iterate through ALL days in the period
  const currentDate = new Date(options.periodStart);
  currentDate.setHours(12, 0, 0, 0); // Noon to avoid timezone issues
  const endDate = new Date(options.periodEnd);
  endDate.setHours(23, 59, 59, 999);

  while (currentDate <= endDate) {
    const dateKey = currentDate.toISOString().split('T')[0];
    const row = rowsByDate.get(dateKey);

    const dayDate = `${formatDateShort(currentDate)} ${getDayName(currentDate)}`.padEnd(15);

    if (row) {
      // Day with data
      const start = row.startTime.padEnd(9);
      const end = row.endTime.padEnd(9);
      const breakTime = row.breakMinutes > 0 ? `${row.breakMinutes}m`.padEnd(5) : '--'.padEnd(5);
      const total = formatHoursHM(row.totalMinutes).padEnd(9);

      lines.push(`│ ${dayDate} │ ${start} │ ${end} │ ${breakTime} │ ${total} │`);
      grandTotalMinutes += row.totalMinutes;
    } else {
      // Day without data - show "--"
      lines.push(`│ ${dayDate} │ ${'--'.padEnd(9)} │ ${'--'.padEnd(9)} │ ${'--'.padEnd(5)} │ ${'--'.padEnd(9)} │`);
    }

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Footer with total
  lines.push('├─────────────────┴───────────┴───────────┴───────┼───────────┤');
  lines.push(`│                              TOTAL HOURS        │ ${formatHoursHM(grandTotalMinutes).padEnd(9)} │`);
  lines.push('└─────────────────────────────────────────────────┴───────────┘');

  return lines.join('\n');
}

// Alternative: Clean text format for WhatsApp
function generateWhatsAppTable(
  sessions: ComputedSession[],
  options: TimesheetOptions
): string {
  const rows = aggregateSessionsByDay(sessions);
  const lines: string[] = [];

  // Create map of day data by date key
  const rowsByDate = new Map<string, DayRow>();
  for (const row of rows) {
    const dateKey = row.date.toISOString().split('T')[0];
    rowsByDate.set(dateKey, row);
  }

  // Header
  lines.push(`*${options.employeeName}*`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  // Calculate totals
  let grandTotalMinutes = 0;

  // Iterate through ALL days in the period
  const currentDate = new Date(options.periodStart);
  currentDate.setHours(12, 0, 0, 0);
  const endDate = new Date(options.periodEnd);
  endDate.setHours(23, 59, 59, 999);

  while (currentDate <= endDate) {
    const dateKey = currentDate.toISOString().split('T')[0];
    const row = rowsByDate.get(dateKey);

    if (row) {
      // Day with data
      const breakStr = row.breakMinutes > 0 ? ` (☕${row.breakMinutes}m)` : '';
      lines.push(`📅 *${row.dateFormatted}* - ${row.dayName}`);
      lines.push(`⏰ ${row.startTime} → ${row.endTime}${breakStr}`);
      lines.push(`✅ *${formatHoursHM(row.totalMinutes)}*`);
      grandTotalMinutes += row.totalMinutes;
    } else {
      // Day without data
      lines.push(`📅 *${formatDateShort(currentDate)}* - ${getDayName(currentDate)}`);
      lines.push(`⏰ -- → --`);
      lines.push(`✅ *--*`);
    }
    lines.push('');

    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Total
  lines.push('━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`📊 *TOTAL: ${formatHoursHM(grandTotalMinutes)}*`);

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

    // Check if expo-print is available
    if (!Print) {
      // Fallback to text-based sharing
      console.log('expo-print not available, using text fallback');
      const textReport = generateSimpleTable(filteredSessions, options);

      return new Promise((resolve, reject) => {
        Alert.alert(
          'Share Timesheet',
          'PDF requires app rebuild. Share as text?',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
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
          ]
        );
      });
    }

    // Generate HTML
    const html = generateSimpleHTML(filteredSessions, options);

    // Generate PDF
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    // Rename file
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
 * Generate and share a text table timesheet
 */
export async function generateAndShareTimesheet(
  sessions: ComputedSession[],
  options: TimesheetOptions
): Promise<void> {
  try {
    const filteredSessions = sessions.filter(s => {
      if (!s.exit_at) return false;
      const entryDate = new Date(s.entry_at);
      return entryDate >= options.periodStart && entryDate <= options.periodEnd;
    });

    const textReport = generateSimpleTable(filteredSessions, options);

    await Share.share({
      message: textReport,
      title: `Timesheet - ${options.employeeName}`,
    });
  } catch (error) {
    console.error('Error sharing timesheet:', error);
    throw error;
  }
}

/**
 * Generate timesheet text and save to file, return the file URI
 */
export async function generateTimesheetFileUri(
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

  // Generate simple table
  const textReport = generateSimpleTable(filteredSessions, options);
  const fileName = `Timesheet_${options.employeeName.replace(/\s+/g, '_')}.txt`;
  const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(fileUri, textReport, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return fileUri;
}

/**
 * Get the raw timesheet text (for preview or copy)
 */
export function getTimesheetText(
  sessions: ComputedSession[],
  options: TimesheetOptions
): string {
  // Filter only completed sessions within period
  const filteredSessions = sessions.filter(s => {
    if (!s.exit_at) return false;
    const entryDate = new Date(s.entry_at);
    return entryDate >= options.periodStart && entryDate <= options.periodEnd;
  });

  if (filteredSessions.length === 0) {
    return 'No completed sessions in this period';
  }

  return generateSimpleTable(filteredSessions, options);
}
