/**
 * Clients - OnSite Timekeeper
 *
 * CRUD for the clients table.
 * Stores client name + address for reuse across invoices.
 */

import { db, generateUUID, now, type ClientDB } from './core';
import { logger } from '../logger';

// ============================================
// TYPES
// ============================================

export interface CreateClientParams {
  userId: string;
  clientName: string;
  addressStreet: string;
  addressCity: string;
  addressProvince: string;
  addressPostalCode: string;
  email?: string | null;
  phone?: string | null;
}

// ============================================
// QUERIES
// ============================================

/**
 * Get all clients for a user, sorted by name
 */
export function getClients(userId: string): ClientDB[] {
  try {
    return db.getAllSync<ClientDB>(
      `SELECT * FROM clients WHERE user_id = ? ORDER BY client_name ASC`,
      [userId]
    );
  } catch (error) {
    logger.error('database', '[DB:clients] Error getting clients', { error: String(error) });
    return [];
  }
}

/**
 * Get a single client by name (case-insensitive)
 */
export function getClientByName(userId: string, clientName: string): ClientDB | null {
  try {
    return db.getFirstSync<ClientDB>(
      `SELECT * FROM clients WHERE user_id = ? AND client_name = ? COLLATE NOCASE`,
      [userId, clientName]
    ) ?? null;
  } catch (error) {
    logger.error('database', '[DB:clients] Error getting client by name', { error: String(error) });
    return null;
  }
}

/**
 * Get a single client by ID
 */
export function getClientById(userId: string, clientId: string): ClientDB | null {
  try {
    return db.getFirstSync<ClientDB>(
      `SELECT * FROM clients WHERE user_id = ? AND id = ?`,
      [userId, clientId]
    ) ?? null;
  } catch (error) {
    logger.error('database', '[DB:clients] Error getting client by id', { error: String(error) });
    return null;
  }
}

// ============================================
// UPSERT (INSERT or UPDATE by name)
// ============================================

/**
 * Create or update a client. If a client with the same name already exists
 * for this user, update their info instead of creating a duplicate.
 */
export function upsertClient(params: CreateClientParams): ClientDB | null {
  const { userId, clientName, addressStreet, addressCity, addressProvince, addressPostalCode, email, phone } = params;

  try {
    const existing = getClientByName(userId, clientName);

    if (existing) {
      // Update existing client
      const timestamp = now();
      db.runSync(
        `UPDATE clients SET
          address_street = ?, address_city = ?, address_province = ?, address_postal_code = ?,
          email = ?, phone = ?, updated_at = ?, synced_at = NULL
        WHERE id = ?`,
        [
          addressStreet, addressCity, addressProvince, addressPostalCode,
          email ?? null, phone ?? null, timestamp,
          existing.id,
        ]
      );
      logger.info('database', `[DB:clients] Updated client: ${__DEV__ ? clientName : 'id=' + existing.id.slice(0, 8)}`);
      return getClientById(userId, existing.id);
    }

    // Create new client
    const id = generateUUID();
    const timestamp = now();

    db.runSync(
      `INSERT INTO clients (
        id, user_id, client_name,
        address_street, address_city, address_province, address_postal_code,
        email, phone, created_at, updated_at, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        id, userId, clientName,
        addressStreet, addressCity, addressProvince, addressPostalCode,
        email ?? null, phone ?? null, timestamp, timestamp,
      ]
    );

    logger.info('database', `[DB:clients] Created client: ${__DEV__ ? clientName : 'id=' + id.slice(0, 8)}`);
    return getClientById(userId, id);
  } catch (error) {
    logger.error('database', '[DB:clients] Error upserting client', { error: String(error) });
    return null;
  }
}

// ============================================
// DELETE
// ============================================

/**
 * Delete a client by ID
 */
export function deleteClient(userId: string, clientId: string): boolean {
  try {
    db.runSync(
      `DELETE FROM clients WHERE user_id = ? AND id = ?`,
      [userId, clientId]
    );
    logger.info('database', `[DB:clients] Deleted client: ${clientId}`);
    return true;
  } catch (error) {
    logger.error('database', '[DB:clients] Error deleting client', { error: String(error) });
    return false;
  }
}
