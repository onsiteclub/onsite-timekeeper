/**
 * Supabase Client - OnSite Timekeeper V2
 * 
 * Configuration with storage adapter compatible
 * with React Native (AsyncStorage) and Web (localStorage)
 * 
 * UPDATED: January 2025 - All types in English
 */

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// ============================================
// CREDENTIALS - MULTIPLE SOURCES
// ============================================

// 1. process.env - works in Expo Go with .env
// 2. Constants.expoConfig.extra - works in EAS Build
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL 
  || Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL 
  || '';

const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY 
  || Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY 
  || '';


// Dev validation
if (__DEV__ && (!supabaseUrl || !supabaseAnonKey)) {
  console.warn(
    '⚠️ Supabase credentials not configured!\n' +
    'For Expo Go: Create a .env file\n' +
    'For EAS Build: Add to app.json extra\n' +
    'EXPO_PUBLIC_SUPABASE_URL=your_url\n' +
    'EXPO_PUBLIC_SUPABASE_ANON_KEY=your_key'
  );
}

// ============================================
// STORAGE ADAPTER
// ============================================

const customStorage = Platform.OS === 'web'
  ? {
      getItem: (key: string) => {
        if (typeof window !== 'undefined') {
          return Promise.resolve(window.localStorage.getItem(key));
        }
        return Promise.resolve(null);
      },
      setItem: (key: string, value: string) => {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, value);
        }
        return Promise.resolve();
      },
      removeItem: (key: string) => {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(key);
        }
        return Promise.resolve();
      },
    }
  : AsyncStorage;

// ============================================
// SUPABASE CLIENT
// ============================================

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// ============================================
// HELPERS
// ============================================

/**
 * Check if Supabase is configured
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/**
 * Get Supabase config for debug
 */
export function getSupabaseConfig() {
  return {
    url: supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'NOT SET',
    keySet: supabaseAnonKey ? 'YES' : 'NO',
    source: process.env.EXPO_PUBLIC_SUPABASE_URL 
      ? 'process.env' 
      : (Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL ? 'Constants.extra' : 'NONE'),
    isConfigured: isSupabaseConfigured(),
  };
}

// ============================================
// DATABASE TYPES (ENGLISH)
// ============================================

export type LocationStatus = 'active' | 'deleted' | 'pending_delete';
export type RecordType = 'automatic' | 'manual';
export type AuditEventType = 'entry' | 'exit' | 'dispute' | 'correction';
export type AdminRole = 'admin' | 'super_admin' | 'viewer';

export interface Database {
  public: {
    Tables: {
      // ============================================
      // PROFILES
      // ============================================
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };

      // ============================================
      // ADMIN USERS
      // ============================================
      admin_users: {
        Row: {
          id: string;
          user_id: string | null;
          email: string;
          name: string;
          role: AdminRole;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['admin_users']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['admin_users']['Insert']>;
      };

      // ============================================
      // ADMIN LOGS
      // ============================================
      admin_logs: {
        Row: {
          id: string;
          admin_id: string | null;
          action: string;
          entity_type: string | null;
          entity_id: string | null;
          details: Record<string, unknown> | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['admin_logs']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['admin_logs']['Insert']>;
      };

      // ============================================
      // LOCATIONS (Geofences)
      // ============================================
      locations: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          latitude: number;
          longitude: number;
          radius: number;
          color: string;
          status: LocationStatus;
          deleted_at: string | null;
          last_seen_at: string;
          created_at: string;
          updated_at: string;
          synced_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['locations']['Row'], 'id' | 'created_at' | 'updated_at' | 'last_seen_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          last_seen_at?: string;
        };
        Update: Partial<Database['public']['Tables']['locations']['Insert']>;
      };

      // ============================================
      // RECORDS (Work Sessions)
      // ============================================
      records: {
        Row: {
          id: string;
          user_id: string;
          location_id: string;
          location_name: string | null;
          entry_at: string;
          exit_at: string | null;
          type: RecordType;
          manually_edited: boolean;
          edit_reason: string | null;
          integrity_hash: string | null;
          color: string | null;
          device_id: string | null;
          pause_minutes: number;
          created_at: string;
          synced_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['records']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['records']['Insert']>;
      };

      // ============================================
      // ANALYTICS DAILY
      // ============================================
      analytics_daily: {
        Row: {
          date: string;
          user_id: string;
          // Business
          sessions_count: number;
          total_minutes: number;
          manual_entries: number;
          auto_entries: number;
          locations_created: number;
          locations_deleted: number;
          // Product
          app_opens: number;
          app_foreground_seconds: number;
          notifications_shown: number;
          notifications_actioned: number;
          features_used: string[];
          // Debug
          errors_count: number;
          sync_attempts: number;
          sync_failures: number;
          geofence_triggers: number;
          geofence_accuracy_avg: number | null;
          // Metadata
          app_version: string | null;
          os: string | null;
          device_model: string | null;
          // Timestamps
          created_at: string;
          synced_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['analytics_daily']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['analytics_daily']['Insert']>;
      };

      // ============================================
      // ERROR LOG
      // ============================================
      error_log: {
        Row: {
          id: string;
          user_id: string | null;
          error_type: string;
          error_message: string;
          error_stack: string | null;
          error_context: Record<string, unknown> | null;
          app_version: string | null;
          os: string | null;
          os_version: string | null;
          device_model: string | null;
          occurred_at: string;
          created_at: string;
          synced_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['error_log']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['error_log']['Insert']>;
      };

      // ============================================
      // LOCATION AUDIT (GPS Proof)
      // ============================================
      location_audit: {
        Row: {
          id: string;
          user_id: string;
          session_id: string | null;
          event_type: AuditEventType;
          location_id: string | null;
          location_name: string | null;
          latitude: number;
          longitude: number;
          accuracy: number | null;
          occurred_at: string;
          created_at: string;
          synced_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['location_audit']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['location_audit']['Insert']>;
      };
    };
  };
}

// ============================================
// TYPED CLIENT HELPER
// ============================================

export type Tables = Database['public']['Tables'];
export type LocationRow = Tables['locations']['Row'];
export type RecordRow = Tables['records']['Row'];
export type AnalyticsRow = Tables['analytics_daily']['Row'];
export type ErrorLogRow = Tables['error_log']['Row'];
export type AuditRow = Tables['location_audit']['Row'];
export type ProfileRow = Tables['profiles']['Row'];
export type AdminUserRow = Tables['admin_users']['Row'];
