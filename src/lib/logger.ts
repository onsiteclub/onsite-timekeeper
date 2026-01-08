/**
 * Logging System - OnSite Timekeeper
 * 
 * - Colored logs in console (dev)
 * - Listeners for DevMonitor
 * - Queue for Supabase upload (optional)
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogCategory = 
  | 'auth' 
  | 'gps' 
  | 'geofence' 
  | 'sync' 
  | 'database' 
  | 'notification'
  | 'session'
  | 'ui'
  | 'boot'
  | 'heartbeat'   
  | 'record'      // English version
  | 'registro'    // Legacy (Portuguese)
  | 'telemetry';

export interface LogEntry {
  id: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

// Configuration
const CONFIG = {
  enableConsole: __DEV__,
  maxStoredLogs: 500,
  enableColors: true,
};

// Emojis per level
const levelEmoji: Record<LogLevel, string> = {
  debug: '🔵',
  info: '🟢',
  warn: '🟡',
  error: '🔴',
};

// Colors per category (for console)
const categoryColor: Record<LogCategory, string> = {
  auth: '\x1b[35m',       // magenta
  gps: '\x1b[36m',        // cyan
  geofence: '\x1b[33m',   // yellow
  sync: '\x1b[34m',       // blue
  database: '\x1b[32m',   // green
  notification: '\x1b[31m', // red
  session: '\x1b[95m',    // light magenta
  ui: '\x1b[94m',         // light blue
  boot: '\x1b[96m',       // light cyan
  heartbeat: '\x1b[93m',  // light yellow
  record: '\x1b[92m',     // light green (English)
  registro: '\x1b[92m',   // light green (Legacy)
  telemetry: '\x1b[90m',  // gray
};

// In-memory log storage
const logStorage: LogEntry[] = [];

// Listeners for DevMonitor
type LogListener = (entry: LogEntry) => void;
const listeners: Set<LogListener> = new Set();

/**
 * Generate simple UUID for logs
 */
function generateLogId(): string {
  return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Add listener to receive logs in real-time
 */
export function addLogListener(listener: LogListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Notify all listeners about new log
 */
function notifyListeners(entry: LogEntry): void {
  listeners.forEach(listener => {
    try {
      listener(entry);
    } catch (e) {
      // Prevent listener error from breaking logging
      console.error('Log listener error:', e);
    }
  });
}

/**
 * Main logging function
 */
function log(
  level: LogLevel,
  category: LogCategory,
  message: string,
  metadata?: Record<string, unknown>
): void {
  const entry: LogEntry = {
    id: generateLogId(),
    level,
    category,
    message,
    metadata,
    timestamp: new Date(),
  };

  // Store in memory (with limit)
  logStorage.push(entry);
  if (logStorage.length > CONFIG.maxStoredLogs) {
    logStorage.shift();
  }

  // Console in development
  if (CONFIG.enableConsole) {
    const emoji = levelEmoji[level];
    const color = CONFIG.enableColors ? categoryColor[category] : '';
    const reset = CONFIG.enableColors ? '\x1b[0m' : '';
    const time = entry.timestamp.toLocaleTimeString('en-US');
    
    const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : '';
    console.log(
      `${emoji} ${color}[${time}][${category.toUpperCase()}]${reset} ${message}${metaStr}`
    );
  }

  // Notify listeners (DevMonitor)
  notifyListeners(entry);
}

/**
 * Public logger API
 */
export const logger = {
  debug: (category: LogCategory, message: string, metadata?: Record<string, unknown>) =>
    log('debug', category, message, metadata),
  
  info: (category: LogCategory, message: string, metadata?: Record<string, unknown>) =>
    log('info', category, message, metadata),
  
  warn: (category: LogCategory, message: string, metadata?: Record<string, unknown>) =>
    log('warn', category, message, metadata),
  
  error: (category: LogCategory, message: string, metadata?: Record<string, unknown>) =>
    log('error', category, message, metadata),
};

/**
 * Return all stored logs
 */
export function getStoredLogs(): LogEntry[] {
  return [...logStorage];
}

/**
 * Return logs filtered by level
 */
export function getLogsByLevel(level: LogLevel): LogEntry[] {
  return logStorage.filter(l => l.level === level);
}

/**
 * Return logs filtered by category
 */
export function getLogsByCategory(category: LogCategory): LogEntry[] {
  return logStorage.filter(l => l.category === category);
}

/**
 * Clear all stored logs
 */
export function clearLogs(): void {
  logStorage.length = 0;
  logger.info('database', 'Logs cleared');
}

/**
 * Export logs as text for debug
 */
export function exportLogsAsText(): string {
  return logStorage
    .map(l => {
      const time = l.timestamp.toISOString();
      const meta = l.metadata ? ` | ${JSON.stringify(l.metadata)}` : '';
      return `[${time}][${l.level.toUpperCase()}][${l.category}] ${l.message}${meta}`;
    })
    .join('\n');
}
