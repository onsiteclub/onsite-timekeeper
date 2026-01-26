/**
 * Access Grants - OnSite Timekeeper
 *
 * QR Code device linking system for sharing work records
 * between workers (owners) and managers (viewers).
 */

import { supabase, type AccessGrant as AccessGrantType, type PendingToken, type RecordRow } from './supabase';
import { logger } from './logger';

// Re-export the type for external use
export type AccessGrant = AccessGrantType;

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
 * Create a new pending token for QR code generation.
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
 * Includes pending requests from viewers.
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
 * Accept a pending access grant request.
 */
export async function acceptGrant(grantId: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('access_grants')
      .update({
        status: 'active',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', grantId)
      .eq('owner_id', user.id)
      .eq('status', 'pending');

    if (error) {
      logger.error('grants', 'Failed to accept grant', { error: error.message });
      return false;
    }

    logger.info('grants', `Grant accepted: ${grantId.substring(0, 8)}...`);
    return true;
  } catch (error) {
    logger.error('grants', 'Error accepting grant', { error: String(error) });
    return false;
  }
}

/**
 * Reject a pending access grant request.
 */
export async function rejectGrant(grantId: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('access_grants')
      .delete()
      .eq('id', grantId)
      .eq('owner_id', user.id)
      .eq('status', 'pending');

    if (error) {
      logger.error('grants', 'Failed to reject grant', { error: error.message });
      return false;
    }

    logger.info('grants', `Grant rejected: ${grantId.substring(0, 8)}...`);
    return true;
  } catch (error) {
    logger.error('grants', 'Error rejecting grant', { error: String(error) });
    return false;
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
 * Redeem a token from QR code to create a pending grant.
 */
export async function redeemToken(token: string): Promise<{
  success: boolean;
  message: string;
  ownerName?: string;
}> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, message: 'Você precisa estar logado' };
    }

    // Find the pending token
    const { data: pendingToken, error: fetchError } = await supabase
      .from('pending_tokens')
      .select('*')
      .eq('token', token)
      .single();

    if (fetchError || !pendingToken) {
      return { success: false, message: 'Token inválido ou não encontrado' };
    }

    const tokenData = pendingToken as PendingToken;

    // Check if expired
    if (new Date(tokenData.expires_at) < new Date()) {
      return { success: false, message: 'Token expirado' };
    }

    // Check if trying to link to self
    if (tokenData.owner_id === user.id) {
      return { success: false, message: 'Você não pode vincular a si mesmo' };
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
        return { success: false, message: 'Você já tem acesso a este trabalhador' };
      }
    }

    // Create the grant (IMMEDIATE ACCESS - no approval needed)
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
      return { success: false, message: 'Erro ao criar vínculo' };
    }

    // Delete the used token
    await supabase
      .from('pending_tokens')
      .delete()
      .eq('id', tokenData.id);

    logger.info('grants', `Token redeemed, access granted for owner: ${tokenData.owner_id.substring(0, 8)}...`);
    return {
      success: true,
      message: 'Acesso liberado! Você já pode ver as horas deste trabalhador.',
      ownerName: tokenData.owner_name ?? undefined,
    };
  } catch (error) {
    logger.error('grants', 'Error redeeming token', { error: String(error) });
    return { success: false, message: 'Erro inesperado' };
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
 * Get work records from a specific owner (for viewers).
 * Only works if there's an active grant.
 */
export async function getSharedRecords(ownerId: string): Promise<RecordRow[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // RLS will automatically filter based on active grants
    const { data, error } = await supabase
      .from('app_timekeeper_entries')
      .select('*')
      .eq('user_id', ownerId)
      .order('entry_at', { ascending: false })
      .limit(100);

    if (error) {
      logger.error('grants', 'Failed to fetch shared records', { error: error.message });
      return [];
    }

    // Map to RecordRow interface
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      user_id: r.user_id as string,
      location_id: r.geofence_id as string,
      location_name: r.geofence_name as string | null,
      entry_at: r.entry_at as string,
      exit_at: r.exit_at as string | null,
      type: (r.is_manual_entry ? 'manual' : 'automatic') as 'manual' | 'automatic',
      manually_edited: r.manually_edited as boolean,
      edit_reason: r.edit_reason as string | null,
      integrity_hash: r.integrity_hash as string | null,
      color: null,
      device_id: r.device_id as string | null,
      pause_minutes: (r.pause_minutes as number) ?? 0,
      created_at: r.created_at as string,
      synced_at: r.synced_at as string | null,
    })) as RecordRow[];
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
  records: RecordRow[];
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
