/**
 * Access Grants - OnSite Timekeeper
 *
 * QR Code device linking system for sharing work records
 * between workers (owners) and managers (viewers).
 *
 * Flow: Worker generates QR → Manager scans → Immediate access (no approval step).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, type AccessGrant as AccessGrantType, type PendingToken } from './supabase';
import { logger } from './logger';

// Re-export the type for external use
export type AccessGrant = AccessGrantType;

// ============================================
// SHARED DAILY HOURS TYPE (V3)
// ============================================

export interface SharedDailyHour {
  id: string;
  user_id: string;
  work_date: string; // YYYY-MM-DD
  total_minutes: number;
  break_minutes: number;
  location_name: string | null;
  location_id: string | null;
  verified: boolean;
  source: string;
  type: string;
  first_entry: string | null;
  last_exit: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// CONSTANTS
// ============================================

const TOKEN_EXPIRY_MINUTES = 5;
const TOKEN_LENGTH = 16;

// ============================================
// TOKEN GENERATION
// ============================================

/**
 * Generate a random token for QR code
 */
function generateToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let token = '';
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// ============================================
// OWNER FUNCTIONS (Worker)
// ============================================

/**
 * Create a new token for QR code generation.
 * Token expires after 5 minutes.
 */
export async function createAccessToken(ownerName?: string): Promise<{
  token: string;
  expiresAt: Date;
} | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      logger.warn('grants', 'No user for token creation');
      return null;
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

    const { error } = await supabase
      .from('pending_tokens')
      .insert({
        owner_id: user.id,
        token,
        owner_name: ownerName ?? null,
        expires_at: expiresAt.toISOString(),
      });

    if (error) {
      logger.error('grants', 'Failed to create token', { error: error.message });
      return null;
    }

    logger.info('grants', `Token created: ${token.substring(0, 4)}...`);
    return { token, expiresAt };
  } catch (error) {
    logger.error('grants', 'Error creating token', { error: String(error) });
    return null;
  }
}

/**
 * Get all access grants where current user is the owner.
 */
export async function getMyGrants(): Promise<AccessGrant[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('access_grants')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('grants', 'Failed to fetch my grants', { error: error.message });
      return [];
    }

    return (data as AccessGrant[]) ?? [];
  } catch (error) {
    logger.error('grants', 'Error fetching my grants', { error: String(error) });
    return [];
  }
}

/**
 * Revoke an active access grant.
 */
export async function revokeGrant(grantId: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('access_grants')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
      })
      .eq('id', grantId)
      .eq('owner_id', user.id);

    if (error) {
      logger.error('grants', 'Failed to revoke grant', { error: error.message });
      return false;
    }

    logger.info('grants', `Grant revoked: ${grantId.substring(0, 8)}...`);
    return true;
  } catch (error) {
    logger.error('grants', 'Error revoking grant', { error: String(error) });
    return false;
  }
}

// ============================================
// VIEWER FUNCTIONS (Manager)
// ============================================

/**
 * Redeem a token from QR code to create an active grant (immediate access).
 */
export async function redeemToken(token: string): Promise<{
  success: boolean;
  message: string;
  ownerName?: string;
  ownerId?: string;
}> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, message: 'You must be logged in' };
    }

    // Find the pending token
    const { data: pendingToken, error: fetchError } = await supabase
      .from('pending_tokens')
      .select('*')
      .eq('token', token)
      .single();

    if (fetchError || !pendingToken) {
      return { success: false, message: 'Invalid or expired token' };
    }

    const tokenData = pendingToken as PendingToken;

    // Check if expired
    if (new Date(tokenData.expires_at) < new Date()) {
      return { success: false, message: 'Token expired' };
    }

    // Check if trying to link to self
    if (tokenData.owner_id === user.id) {
      return { success: false, message: 'You cannot link to yourself' };
    }

    // Check if grant already exists
    const { data: existingGrant } = await supabase
      .from('access_grants')
      .select('id, status')
      .eq('owner_id', tokenData.owner_id)
      .eq('viewer_id', user.id)
      .single();

    if (existingGrant) {
      const grant = existingGrant as { id: string; status: string };
      if (grant.status === 'active') {
        return { success: false, message: 'You already have access to this worker' };
      }

      // Re-activate previously revoked grant
      const { error: updateError } = await supabase
        .from('access_grants')
        .update({
          token: token,
          status: 'active',
          accepted_at: new Date().toISOString(),
          revoked_at: null,
          label: tokenData.owner_name,
        })
        .eq('id', grant.id);

      if (updateError) {
        logger.error('grants', 'Failed to reactivate grant', { error: updateError.message });
        return { success: false, message: 'Failed to create link' };
      }
    } else {
      // Create new grant (IMMEDIATE ACCESS - no approval needed)
      const { error: insertError } = await supabase
        .from('access_grants')
        .insert({
          owner_id: tokenData.owner_id,
          viewer_id: user.id,
          token: token,
          status: 'active',
          accepted_at: new Date().toISOString(),
          label: tokenData.owner_name,
        });

      if (insertError) {
        logger.error('grants', 'Failed to create grant', { error: insertError.message });
        return { success: false, message: 'Failed to create link' };
      }
    }

    // Delete the used token
    await supabase
      .from('pending_tokens')
      .delete()
      .eq('id', tokenData.id);

    logger.info('grants', `Token redeemed, access granted for owner: ${tokenData.owner_id.substring(0, 8)}...`);
    return {
      success: true,
      message: 'Access granted! You can now view this worker\'s hours.',
      ownerName: tokenData.owner_name ?? undefined,
      ownerId: tokenData.owner_id,
    };
  } catch (error) {
    logger.error('grants', 'Error redeeming token', { error: String(error) });
    return { success: false, message: 'Unexpected error' };
  }
}

/**
 * Unlink a worker (viewer removes their own access to an owner's records).
 */
export async function unlinkWorker(grantId: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('access_grants')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
      })
      .eq('id', grantId)
      .eq('viewer_id', user.id);

    if (error) {
      logger.error('grants', 'Failed to unlink worker', { error: error.message });
      return false;
    }

    logger.info('grants', `Worker unlinked: ${grantId.substring(0, 8)}...`);
    return true;
  } catch (error) {
    logger.error('grants', 'Error unlinking worker', { error: String(error) });
    return false;
  }
}

/**
 * Update the display label for a linked worker (viewer-only, local to this grant).
 */
export async function updateGrantLabel(ownerId: string, label: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('access_grants')
      .update({ label })
      .eq('owner_id', ownerId)
      .eq('viewer_id', user.id)
      .eq('status', 'active');

    if (error) {
      logger.error('grants', 'Failed to update grant label', { error: error.message });
      return false;
    }

    logger.info('grants', `Label updated for owner ${ownerId.substring(0, 8)}...`);
    return true;
  } catch (error) {
    logger.error('grants', 'Error updating grant label', { error: String(error) });
    return false;
  }
}

/**
 * Get all access grants where current user is the viewer.
 */
export async function getGrantedAccess(): Promise<AccessGrant[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('access_grants')
      .select('*')
      .eq('viewer_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('grants', 'Failed to fetch granted access', { error: error.message });
      return [];
    }

    return (data as AccessGrant[]) ?? [];
  } catch (error) {
    logger.error('grants', 'Error fetching granted access', { error: String(error) });
    return [];
  }
}

/**
 * Get daily hours from a specific owner (for viewers).
 * Only works if there's an active grant + RLS policy on daily_hours.
 */
export async function getSharedRecords(ownerId: string): Promise<SharedDailyHour[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // RLS will automatically filter based on active grants
    const { data, error } = await supabase
      .from('daily_hours')
      .select('*')
      .eq('user_id', ownerId)
      .order('work_date', { ascending: false })
      .limit(100);

    if (error) {
      logger.error('grants', 'Failed to fetch shared records', { error: error.message });
      return [];
    }

    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      user_id: r.user_id as string,
      work_date: r.work_date as string,
      total_minutes: (r.total_minutes as number) ?? 0,
      break_minutes: (r.break_minutes as number) ?? 0,
      location_name: r.location_name as string | null,
      location_id: r.location_id as string | null,
      verified: Boolean(r.verified),
      source: (r.source as string) ?? 'manual',
      type: (r.type as string) ?? 'work',
      first_entry: r.first_entry as string | null,
      last_exit: r.last_exit as string | null,
      notes: r.notes as string | null,
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
    }));
  } catch (error) {
    logger.error('grants', 'Error fetching shared records', { error: String(error) });
    return [];
  }
}

/**
 * Get all shared records from all owners (for team dashboard).
 */
export async function getAllSharedRecords(): Promise<{
  ownerId: string;
  ownerName: string | null;
  records: SharedDailyHour[];
}[]> {
  try {
    const grants = await getGrantedAccess();

    const results = await Promise.all(
      grants.map(async (grant) => {
        const records = await getSharedRecords(grant.owner_id);
        return {
          ownerId: grant.owner_id,
          ownerName: grant.label,
          records,
        };
      })
    );

    return results;
  } catch (error) {
    logger.error('grants', 'Error fetching all shared records', { error: String(error) });
    return [];
  }
}

// ============================================
// ARCHIVE FUNCTIONS (Local-only, per viewer)
// ============================================

interface ArchivedRecord {
  recordId: string;
  archivedAt: string;
}

const ARCHIVE_MAX_DAYS = 60;

function getArchiveKey(ownerId: string): string {
  return `archived_records_${ownerId}`;
}

async function loadArchiveData(ownerId: string): Promise<ArchivedRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(getArchiveKey(ownerId));
    if (!raw) return [];
    return JSON.parse(raw) as ArchivedRecord[];
  } catch {
    return [];
  }
}

async function saveArchiveData(ownerId: string, data: ArchivedRecord[]): Promise<void> {
  await AsyncStorage.setItem(getArchiveKey(ownerId), JSON.stringify(data));
}

/**
 * Get set of archived record IDs for a specific owner.
 * Automatically cleans up entries older than 60 days.
 */
export async function getArchivedIds(ownerId: string): Promise<Set<string>> {
  const data = await loadArchiveData(ownerId);
  const cutoff = Date.now() - ARCHIVE_MAX_DAYS * 24 * 60 * 60 * 1000;
  const valid = data.filter(r => new Date(r.archivedAt).getTime() > cutoff);

  if (valid.length !== data.length) {
    await saveArchiveData(ownerId, valid);
  }

  return new Set(valid.map(r => r.recordId));
}

/**
 * Archive a list of record IDs for a specific owner.
 */
export async function archiveRecords(ownerId: string, recordIds: string[]): Promise<void> {
  const data = await loadArchiveData(ownerId);
  const existingIds = new Set(data.map(r => r.recordId));
  const now = new Date().toISOString();

  const newEntries = recordIds
    .filter(id => !existingIds.has(id))
    .map(recordId => ({ recordId, archivedAt: now }));

  if (newEntries.length > 0) {
    await saveArchiveData(ownerId, [...data, ...newEntries]);
    logger.info('grants', `Archived ${newEntries.length} records for owner ${ownerId.substring(0, 8)}...`);
  }
}

// ============================================
// QR CODE PAYLOAD
// ============================================

export interface QRCodePayload {
  app: 'onsite-timekeeper';
  action: 'link';
  token: string;
  ownerName?: string;
}

/**
 * Create QR code payload for encoding.
 */
export function createQRPayload(token: string, ownerName?: string): string {
  const payload: QRCodePayload = {
    app: 'onsite-timekeeper',
    action: 'link',
    token,
    ownerName,
  };
  return JSON.stringify(payload);
}

/**
 * Parse QR code payload.
 */
export function parseQRPayload(data: string): QRCodePayload | null {
  try {
    const payload = JSON.parse(data);
    if (payload.app !== 'onsite-timekeeper' || payload.action !== 'link') {
      return null;
    }
    return payload as QRCodePayload;
  } catch {
    return null;
  }
}
