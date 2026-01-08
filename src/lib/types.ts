/**
 * Utility Types - OnSite Timekeeper
 * 
 * Portable types that work across Node.js and React Native
 * 
 * USE THESE instead of NodeJS.Timeout to avoid TypeScript errors
 * when @types/node is not installed or configured differently.
 */

// ============================================
// TIMER TYPES (portable)
// ============================================

/**
 * Portable timeout type - works in Node.js, browser, and React Native
 * Use this instead of NodeJS.Timeout
 * 
 * @example
 * let timeoutId: TimeoutId | null = null;
 * timeoutId = setTimeout(() => {}, 1000);
 * if (timeoutId) clearTimeout(timeoutId);
 */
export type TimeoutId = ReturnType<typeof setTimeout>;

/**
 * Portable interval type - works in Node.js, browser, and React Native
 * Use this instead of NodeJS.Timeout for setInterval
 * 
 * @example
 * let intervalId: IntervalId | null = null;
 * intervalId = setInterval(() => {}, 1000);
 * if (intervalId) clearInterval(intervalId);
 */
export type IntervalId = ReturnType<typeof setInterval>;

// ============================================
// UTILITY TYPES
// ============================================

/**
 * Makes all properties of T optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Extracts the resolved type from a Promise
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

/**
 * Makes specific keys required while keeping others as-is
 */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Makes all keys optional except the specified ones
 */
export type PartialExcept<T, K extends keyof T> = Partial<Omit<T, K>> & Pick<T, K>;

/**
 * Extract keys of T that have values assignable to V
 */
export type KeysOfType<T, V> = {
  [K in keyof T]: T[K] extends V ? K : never;
}[keyof T];
