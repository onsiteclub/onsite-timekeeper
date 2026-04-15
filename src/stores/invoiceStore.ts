/**
 * Invoice Store - OnSite Timekeeper
 *
 * Manages invoice dashboard state, creation flows,
 * and client management (save/load for auto-fill).
 * SQLite is source of truth — this store is an in-memory cache.
 */

import { create } from 'zustand';
import { logger } from '../lib/logger';
import {
  getRecentInvoices,
  getThisMonthTotal,
  getThisMonthCount,
  getDistinctClientNames,
  createInvoice,
  createInvoiceWithItems,
  updateInvoicePdfUri,
  formatInvoiceNumber,
  deleteInvoice as dbDeleteInvoice,
  getInvoiceItems,
  updateInvoice as dbUpdateInvoice,
  replaceInvoiceItems,
  type CreateInvoiceItemParams,
  type UpdateInvoiceParams,
} from '../lib/database/invoices';
import { getClients, upsertClient, deleteClient as dbDeleteClient, getClientByName, type CreateClientParams } from '../lib/database/clients';
import { getDailyHoursByPeriod } from '../lib/database/daily';
import type { InvoiceDB, DailyHoursDB, ClientDB } from '../lib/database/core';
import { useBusinessProfileStore } from './businessProfileStore';
import { generateHourlyInvoiceHTML, generateProductsInvoiceHTML, generateInvoicePDF } from '../lib/invoicePdf';

// ============================================
// TYPES
// ============================================

export interface ClientAddress {
  street: string;
  city: string;
  province: string;
  postalCode: string;
  email?: string | null;
  phone?: string | null;
}

interface InvoiceState {
  // Dashboard summary
  thisMonthTotal: number;
  thisMonthCount: number;

  // Invoice list
  recentInvoices: InvoiceDB[];
  isLoading: boolean;

  // Client autocomplete (legacy string list)
  recentClients: string[];

  // Saved clients (full objects)
  clients: ClientDB[];

  // Actions
  loadDashboard: (userId: string) => void;
  loadRecentInvoices: (userId: string) => void;
  loadClientNames: (userId: string) => void;
  loadClients: (userId: string) => void;

  // Client management
  saveClient: (params: CreateClientParams) => ClientDB | null;
  removeClient: (userId: string, clientId: string) => void;

  createHourlyInvoice: (params: {
    userId: string;
    clientName: string;
    clientId?: string | null;
    clientAddress?: ClientAddress | null;
    days: DailyHoursDB[];
    hourlyRate: number;
    taxRate: number;
    periodStart: string;
    periodEnd: string;
    dueDate?: string;
    notes?: string;
  }) => Promise<InvoiceDB | null>;

  createProductsInvoice: (params: {
    userId: string;
    clientName: string;
    clientId?: string | null;
    clientAddress?: ClientAddress | null;
    items: { description: string; quantity: number; unitPrice: number }[];
    taxRate: number;
    dueDate?: string;
    notes?: string;
  }) => Promise<InvoiceDB | null>;

  updateInvoice: (userId: string, invoiceId: string, params: UpdateInvoiceParams, newItems?: CreateInvoiceItemParams[]) => Promise<InvoiceDB | null>;
  deleteInvoice: (userId: string, invoiceId: string) => boolean;
  regeneratePdf: (userId: string, invoice: InvoiceDB) => Promise<string | null>;
  refreshAll: (userId: string) => void;
  clear: () => void;
}

// ============================================
// STORE
// ============================================

export const useInvoiceStore = create<InvoiceState>()((set, get) => ({
  thisMonthTotal: 0,
  thisMonthCount: 0,
  recentInvoices: [],
  isLoading: false,
  recentClients: [],
  clients: [],

  loadDashboard: (userId: string) => {
    try {
      set({ isLoading: true });
      const thisMonthTotal = getThisMonthTotal(userId);
      const thisMonthCount = getThisMonthCount(userId);
      const recentInvoices = getRecentInvoices(userId, 20);
      const recentClients = getDistinctClientNames(userId);
      const clients = getClients(userId);

      set({
        thisMonthTotal,
        thisMonthCount,
        recentInvoices,
        recentClients,
        clients,
        isLoading: false,
      });
    } catch (error) {
      logger.error('invoice', 'Error loading dashboard', { error: String(error) });
      set({ isLoading: false });
    }
  },

  loadRecentInvoices: (userId: string) => {
    try {
      const recentInvoices = getRecentInvoices(userId, 20);
      set({ recentInvoices });
    } catch (error) {
      logger.error('invoice', 'Error loading recent invoices', { error: String(error) });
    }
  },

  loadClientNames: (userId: string) => {
    try {
      const recentClients = getDistinctClientNames(userId);
      set({ recentClients });
    } catch (error) {
      logger.error('invoice', 'Error loading client names', { error: String(error) });
    }
  },

  loadClients: (userId: string) => {
    try {
      const clients = getClients(userId);
      set({ clients });
    } catch (error) {
      logger.error('invoice', 'Error loading clients', { error: String(error) });
    }
  },

  saveClient: (params: CreateClientParams) => {
    try {
      const client = upsertClient(params);
      if (client) {
        // Refresh clients list
        const clients = getClients(params.userId);
        set({ clients });
        logger.info('invoice', `Client saved: ${__DEV__ ? params.clientName : 'client'}`);
      }
      return client;
    } catch (error) {
      logger.error('invoice', 'Error saving client', { error: String(error) });
      return null;
    }
  },

  removeClient: (userId: string, clientId: string) => {
    const success = dbDeleteClient(userId, clientId);
    if (success) {
      const clients = getClients(userId);
      set({ clients });
    }
  },

  createHourlyInvoice: async (params) => {
    const { userId, clientName, clientId, clientAddress, days, hourlyRate, taxRate, periodStart, periodEnd, dueDate, notes } = params;

    try {
      // Increment invoice number FIRST to avoid UNIQUE constraint on retry
      const bpStore = useBusinessProfileStore.getState();
      const businessProfile = bpStore.profile;
      const invoiceNum = bpStore.incrementInvoiceNumber(userId);
      const invoiceNumber = formatInvoiceNumber(invoiceNum);

      // Calculate totals
      const totalMinutes = days.reduce((sum, d) => sum + (d.total_minutes || 0), 0);
      const totalHours = totalMinutes / 60;
      const subtotal = Math.round(totalHours * hourlyRate * 100) / 100;
      const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
      const total = Math.round((subtotal + taxAmount) * 100) / 100;

      // Create invoice record
      const invoice = createInvoice({
        userId,
        invoiceNumber,
        type: 'hourly',
        clientName,
        clientId: clientId ?? null,
        subtotal,
        taxRate,
        taxAmount,
        total,
        hourlyRate,
        periodStart,
        periodEnd,
        dueDate: dueDate ?? null,
        notes: notes ?? null,
      });

      if (!invoice) return null;

      // Generate PDF
      try {
        const html = generateHourlyInvoiceHTML({
          invoiceNumber,
          businessProfile: businessProfile ?? null,
          clientName,
          clientAddress: clientAddress ?? null,
          days,
          hourlyRate,
          taxRate,
          periodStart,
          periodEnd,
          dueDate: dueDate ?? null,
        });
        const pdfUri = await generateInvoicePDF(html, invoiceNumber);
        updateInvoicePdfUri(invoice.id, pdfUri);
        invoice.pdf_uri = pdfUri;
      } catch (pdfError) {
        logger.warn('invoice', 'PDF generation failed (invoice still created)', { error: String(pdfError) });
      }

      // Refresh dashboard
      get().loadDashboard(userId);

      logger.info('invoice', `Hourly invoice created: ${invoiceNumber}${__DEV__ ? ` — $${total.toFixed(2)}` : ''}`);
      return invoice;
    } catch (error) {
      logger.error('invoice', 'Error creating hourly invoice', { error: String(error) });
      return null;
    }
  },

  createProductsInvoice: async (params) => {
    const { userId, clientName, clientId, clientAddress, items, taxRate, dueDate, notes } = params;

    try {
      // Increment invoice number FIRST to avoid UNIQUE constraint on retry
      const bpStore = useBusinessProfileStore.getState();
      const businessProfile = bpStore.profile;
      const invoiceNum = bpStore.incrementInvoiceNumber(userId);
      const invoiceNumber = formatInvoiceNumber(invoiceNum);

      // Calculate totals
      const lineItems: CreateInvoiceItemParams[] = items.map((item, i) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: Math.round(item.quantity * item.unitPrice * 100) / 100,
        sortOrder: i,
      }));

      const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
      const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
      const total = Math.round((subtotal + taxAmount) * 100) / 100;

      // Create invoice with items
      const invoice = createInvoiceWithItems(
        {
          userId,
          invoiceNumber,
          type: 'products_services',
          clientName,
          clientId: clientId ?? null,
          subtotal,
          taxRate,
          taxAmount,
          total,
          dueDate: dueDate ?? null,
          notes: notes ?? null,
        },
        lineItems
      );

      if (!invoice) return null;

      // Generate PDF
      try {
        const html = generateProductsInvoiceHTML({
          invoiceNumber,
          businessProfile: businessProfile ?? null,
          clientName,
          clientAddress: clientAddress ?? null,
          items: lineItems.map((item, i) => ({
            id: '',
            invoice_id: invoice.id,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            total: item.total,
            sort_order: i,
          })),
          taxRate,
          dueDate: dueDate ?? null,
        });
        const pdfUri = await generateInvoicePDF(html, invoiceNumber);
        updateInvoicePdfUri(invoice.id, pdfUri);
        invoice.pdf_uri = pdfUri;
      } catch (pdfError) {
        logger.warn('invoice', 'PDF generation failed (invoice still created)', { error: String(pdfError) });
      }

      // Refresh dashboard
      get().loadDashboard(userId);

      logger.info('invoice', `Products invoice created: ${invoiceNumber}${__DEV__ ? ` — $${total.toFixed(2)}` : ''}`);
      return invoice;
    } catch (error) {
      logger.error('invoice', 'Error creating products invoice', { error: String(error) });
      return null;
    }
  },

  updateInvoice: async (userId: string, invoiceId: string, params: UpdateInvoiceParams, newItems?: CreateInvoiceItemParams[]) => {
    try {
      const updated = dbUpdateInvoice(userId, invoiceId, params);
      if (!updated) return null;

      // Replace line items if provided (products invoices)
      if (newItems) {
        replaceInvoiceItems(invoiceId, newItems);
      }

      // Regenerate PDF with updated data
      await get().regeneratePdf(userId, updated);

      // Reload dashboard to reflect changes
      get().loadDashboard(userId);

      logger.info('invoice', `Invoice updated: ${updated.invoice_number}`);
      return updated;
    } catch (error) {
      logger.error('invoice', 'Error updating invoice', { error: String(error) });
      return null;
    }
  },

  deleteInvoice: (userId: string, invoiceId: string) => {
    try {
      const success = dbDeleteInvoice(userId, invoiceId);
      if (success) {
        get().loadDashboard(userId);
        logger.info('invoice', `Invoice deleted: ${invoiceId.slice(0, 8)}`);
      }
      return success;
    } catch (error) {
      logger.error('invoice', 'Error deleting invoice', { error: String(error) });
      return false;
    }
  },

  regeneratePdf: async (userId: string, invoice: InvoiceDB) => {
    try {
      const bpStore = useBusinessProfileStore.getState();
      const businessProfile = bpStore.profile;

      // Lookup client address
      let clientAddress: { street: string; city: string; province: string; postalCode: string } | null = null;
      if (invoice.client_name) {
        const client = getClientByName(userId, invoice.client_name);
        if (client) {
          clientAddress = {
            street: client.address_street || '',
            city: client.address_city || '',
            province: client.address_province || '',
            postalCode: client.address_postal_code || '',
          };
        }
      }

      let html: string;

      if (invoice.type === 'products_services') {
        const items = getInvoiceItems(invoice.id);
        html = generateProductsInvoiceHTML({
          invoiceNumber: invoice.invoice_number,
          businessProfile,
          clientName: invoice.client_name || '',
          clientAddress,
          items,
          taxRate: invoice.tax_rate,
        });
      } else {
        // Hourly invoice
        if (!invoice.period_start || !invoice.period_end) {
          logger.warn('invoice', 'Cannot regenerate hourly PDF — missing period dates');
          return null;
        }
        const days = getDailyHoursByPeriod(userId, invoice.period_start, invoice.period_end);
        html = generateHourlyInvoiceHTML({
          invoiceNumber: invoice.invoice_number,
          businessProfile,
          clientName: invoice.client_name || '',
          clientAddress,
          days: days as unknown as DailyHoursDB[],
          hourlyRate: invoice.hourly_rate || 0,
          taxRate: invoice.tax_rate,
          periodStart: invoice.period_start,
          periodEnd: invoice.period_end,
          dueDate: invoice.due_date ?? null,
        });
      }

      const pdfUri = await generateInvoicePDF(html, invoice.invoice_number);
      updateInvoicePdfUri(invoice.id, pdfUri);

      // Refresh to update cached invoice
      get().loadDashboard(userId);

      logger.info('invoice', `PDF regenerated for ${invoice.invoice_number}`);
      return pdfUri;
    } catch (error) {
      logger.error('invoice', 'Error regenerating PDF', { error: String(error) });
      return null;
    }
  },

  refreshAll: (userId: string) => {
    get().loadDashboard(userId);
  },

  clear: () => {
    set({
      thisMonthTotal: 0,
      thisMonthCount: 0,
      recentInvoices: [],
      recentClients: [],
      clients: [],
      isLoading: false,
    });
  },
}));
