/**
 * Database Module - OnSite Timekeeper V3
 *
 * Re-exports all database functionality.
 * V3: Removed records (replaced by daily_hours + active_tracking)
 */

// ============================================
// CORE
// ============================================

export {
  db,
  initDatabase,
  generateUUID,
  now,
  getToday,
  toLocalDateString,
  calculateDistance,
  calculateDuration,
  formatDuration,
  // Types
  type LocationStatus,
  type AuditEventType,
  type DailyHoursSource,
  type DailyHoursType,
  type LocationDB,
  type AnalyticsDailyDB,
  type ErrorLogDB,
  type LocationAuditDB,
  type DailyHoursDB,
} from './core';

// ============================================
// LOCATIONS
// ============================================

export {
  createLocation,
  getLocations,
  getLocationById,
  updateLocation,
  removeLocation,
  updateLastSeen,
  getLocationsForSync,
  markLocationSynced,
  upsertLocationFromSync,
  type CreateLocationParams,
} from './locations';

// ============================================
// ANALYTICS (replaces telemetry)
// ============================================

export {
  // Tracking
  trackMetric,
  trackGeofenceTrigger,
  trackFeatureUsed,
  trackSessionMinutes,
  // Queries
  getTodayAnalytics,
  getAnalyticsByPeriod,
  getAnalyticsForSync,
  markAnalyticsSynced,
  cleanOldAnalytics,
  // Stats
  getAnalyticsSummary,
  getAnalyticsDebugInfo,
  getDeviceMetadata,
  // Types
  type AnalyticsField,
  type FeatureName,
  type AnalyticsSummary,
} from './analytics';

// ============================================
// ERRORS
// ============================================

export {
  // Capture
  captureError,
  captureErrorAuto,
  captureSyncError,
  captureDatabaseError,
  captureNetworkError,
  captureGeofenceError,
  // Queries
  getRecentErrors,
  getErrorsByType,
  getErrorsForSync,
  markErrorsSynced,
  cleanOldErrors,
  // Stats
  getErrorStats,
  // Types
  type ErrorType,
  type ErrorContext,
  type ErrorStats,
} from './errors';

// ============================================
// LOCATION AUDIT (replaces geopoints)
// ============================================

export {
  // Record
  recordLocationAudit,
  recordEntryAudit,
  recordExitAudit,
  recordDisputeAudit,
  recordCorrectionAudit,
  // Queries
  getSessionAudit,
  getUserAudit,
  getAuditByPeriod,
  getAuditForSync,
  markAuditSynced,
  cleanOldAudit,
  // Stats
  getAuditStats,
  getSessionProof,
  // Types
  type AuditStats,
  type SessionProof,
} from './audit';

// ============================================
// DAILY HOURS (User-facing consolidated view)
// ============================================

export {
  // Queries
  getDailyHours,
  getTodayHours,
  getDailyHoursByPeriod,
  // CRUD
  upsertDailyHours,
  updateDailyHours,
  addMinutesToDay,
  deleteDailyHours,
  deleteDailyHoursById,
  // Sync
  getUnsyncedDailyHours,
  markDailyHoursSynced,
  upsertDailyHoursFromSync,
  // Types
  type UpsertDailyHoursParams,
  type UpdateDailyHoursParams,
} from './daily';

// ============================================
// DEBUG
// ============================================

export {
  getDbStats,
  resetDatabase,
} from './debug';

