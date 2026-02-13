/**
 * Platform - OnSite Timekeeper
 *
 * Helpers to detect web vs native platform.
 * Used by components to conditionally show/hide native-only features.
 */

import { Platform } from 'react-native';

export const isWeb = Platform.OS === 'web';
export const isNative = Platform.OS !== 'web';
