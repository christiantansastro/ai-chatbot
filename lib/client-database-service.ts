/**
 * Client Database Service for OpenPhone Sync
 * 
 * This service handles fetching and managing client data from Supabase
 * for the OpenPhone contact sync process.
 */

import { Client } from './db/schema';

// Extend the existing SupabaseAdapter to add client-specific methods
export interface ClientQueryOptions {
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;
  updatedSince?: Date;
  clientType?: 'criminal' | 'civil';
}

// Client sync status tracking
export interface ClientSyncStatus {
  clientId: string;
  lastSyncedAt: Date | null;
  lastModifiedAt: Date;
  openPhoneContactId?: string;
  syncStatus: 'pending' | 'synced' | 'failed' | 'skipped';
  errorMessage?: string;
}

export interface ClientDatabaseResult {
  clients: Client[];
  totalCount: number;
  hasMore: boolean;
}

export class ClientDatabaseService {
  private supabase: any; // Supabase client
  private serviceClient: any; // Service role client

  constructor() {
    // This will be initialized when connecting to the database
    this.supabase = null;
    this.serviceClient = null;
  }

  /**
   * Initialize the service with Supabase clients
   */
  initialize(supabase: any, serviceSupabase?: any): void {
    this.supabase = supabase;
    this.serviceClient = serviceSupabase || supabase;
  }

  /**
   * Get all clients from the database
   */
  async getAllClients(options: ClientQueryOptions = {}): Promise<ClientDatabaseResult> {
    try {
      const client = this.serviceClient || this.supabase;
      
      let query = client
        .from('clients')
        .select('*', { count: 'exact' })
        .order('updated_at', { ascending: false });

      // Apply filters
      if (options.clientType) {
        query = query.eq('client_type', options.clientType);
      }

      if (options.updatedSince) {
        query = query.gte('updated_at', options.updatedSince.toISOString());
      }

      if (options.limit) {
        query = query.limit(options.limit + 1); // +1 to check if there are more
      }

      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
      }

      const { data, error, count } = await query;

      if (error) {
        throw new Error(`Failed to fetch clients: ${error.message}`);
      }

      const clients = data || [];
      const hasMore = options.limit ? clients.length > options.limit : false;
      const limitedClients = hasMore ? clients.slice(0, options.limit) : clients;

      // Convert database rows to Client type
      const mappedClients = limitedClients.map((row: any) => ({
        ...row,
        createdAt: new Date(row.created_at || row.createdAt),
        updatedAt: new Date(row.updated_at || row.updatedAt),
        dateIntake: row.date_intake ? new Date(row.date_intake) : null,
        dateOfBirth: row.date_of_birth ? new Date(row.date_of_birth) : null,
        courtDate: row.court_date ? new Date(row.court_date) : null,
        dueDateBalance: row.due_date_balance ? new Date(row.due_date_balance) : null,
        lastBondHearingDate: row.last_bond_hearing_date ? new Date(row.last_bond_hearing_date) : null,
        dateOfIncident: row.date_of_incident ? new Date(row.date_of_incident) : null,
        previousOrdersCounty: row.previous_orders_county ? new Date(row.previous_orders_county) : null,
      })) as Client[];

      return {
        clients: mappedClients,
        totalCount: count || 0,
        hasMore,
      };
    } catch (error) {
      console.error('Error fetching clients:', error);
      throw new Error(`Failed to fetch clients: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get clients that have been updated since a specific date (for incremental sync)
   */
  async getUpdatedClients(since: Date, options: ClientQueryOptions = {}): Promise<ClientDatabaseResult> {
    return this.getAllClients({
      ...options,
      updatedSince: since,
    });
  }

  /**
   * Get a single client by ID
   */
  async getClientById(clientId: string): Promise<Client | null> {
    try {
      const client = this.serviceClient || this.supabase;
      
      const { data, error } = await client
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw new Error(`Failed to fetch client: ${error.message}`);
      }

      if (!data) return null;

      return {
        ...data,
        createdAt: new Date(data.created_at || data.createdAt),
        updatedAt: new Date(data.updated_at || data.updatedAt),
        dateIntake: data.date_intake ? new Date(data.date_intake) : null,
        dateOfBirth: data.date_of_birth ? new Date(data.date_of_birth) : null,
        courtDate: data.court_date ? new Date(data.court_date) : null,
        dueDateBalance: data.due_date_balance ? new Date(data.due_date_balance) : null,
        lastBondHearingDate: data.last_bond_hearing_date ? new Date(data.last_bond_hearing_date) : null,
        dateOfIncident: data.date_of_incident ? new Date(data.date_of_incident) : null,
        previousOrdersCounty: data.previous_orders_county ? new Date(data.previous_orders_county) : null,
      } as Client;
    } catch (error) {
      console.error('Error fetching client by ID:', error);
      throw new Error(`Failed to fetch client by ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get clients with alternative contacts (for validation)
   */
  async getClientsWithAlternativeContacts(options: ClientQueryOptions = {}): Promise<ClientDatabaseResult> {
    try {
      // Get clients that have at least one alternative contact
      const result = await this.getAllClients({
        ...options,
      });

      // Filter clients that have alternative contacts
      const clientsWithAltContacts = result.clients.filter(client => 
        (client.contact_1 && client.contact_1_phone && client.relationship_1) ||
        (client.contact_2 && client.contact_2_phone && client.relationship_2)
      );

      return {
        clients: clientsWithAltContacts,
        totalCount: clientsWithAltContacts.length,
        hasMore: result.hasMore, // This might not be accurate after filtering
      };
    } catch (error) {
      console.error('Error fetching clients with alternative contacts:', error);
      throw new Error(`Failed to fetch clients with alternative contacts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate client data integrity
   */
  async validateClientData(client: Client): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Required fields
    if (!client.client_name) {
      errors.push('Client name is required');
    }

    if (!client.client_type || !['criminal', 'civil'].includes(client.client_type)) {
      errors.push('Client type must be either "criminal" or "civil"');
    }

    if (!client.phone) {
      errors.push('Phone number is required');
    }

    // Validate alternative contacts if present
    if (client.contact_1 || client.contact_1_phone || client.relationship_1) {
      if (!client.contact_1 || !client.contact_1_phone || !client.relationship_1) {
        errors.push('Alternative contact 1 requires name, phone, and relationship');
      }
    }

    if (client.contact_2 || client.contact_2_phone || client.relationship_2) {
      if (!client.contact_2 || !client.contact_2_phone || !client.relationship_2) {
        errors.push('Alternative contact 2 requires name, phone, and relationship');
      }
    }

    // Validate phone number format (basic)
    if (client.phone && client.phone.replace(/\D/g, '').length < 7) {
      errors.push('Main phone number appears to be invalid');
    }

    if (client.contact_1_phone && client.contact_1_phone.replace(/\D/g, '').length < 7) {
      errors.push('Alternative contact 1 phone number appears to be invalid');
    }

    if (client.contact_2_phone && client.contact_2_phone.replace(/\D/g, '').length < 7) {
      errors.push('Alternative contact 2 phone number appears to be invalid');
    }

    // Validate email format if present
    if (client.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email)) {
      errors.push('Email format appears to be invalid');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get client statistics for monitoring
   */
  async getClientStatistics(): Promise<{
    totalClients: number;
    criminalClients: number;
    civilClients: number;
    clientsWithAlternativeContacts: number;
    recentlyUpdated: number; // Updated in last 24 hours
  }> {
    try {
      const client = this.serviceClient || this.supabase;
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Get basic counts
      const { count: totalClients } = await client
        .from('clients')
        .select('*', { count: 'exact', head: true });

      const { count: criminalClients } = await client
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('client_type', 'criminal');

      const { count: civilClients } = await client
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('client_type', 'civil');

      // Get clients with alternative contacts (this is a simplified query)
      // In practice, you might want to use a more efficient approach
      const { count: clientsWithAlternativeContacts } = await client
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .not('contact_1', 'is', null);

      const { count: recentlyUpdated } = await client
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .gte('updated_at', yesterday.toISOString());

      return {
        totalClients: totalClients || 0,
        criminalClients: criminalClients || 0,
        civilClients: civilClients || 0,
        clientsWithAlternativeContacts: clientsWithAlternativeContacts || 0,
        recentlyUpdated: recentlyUpdated || 0,
      };
    } catch (error) {
      console.error('Error fetching client statistics:', error);
      throw new Error(`Failed to fetch client statistics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Test database connection and client table accessibility
   */
  async testConnection(): Promise<{ isConnected: boolean; error?: string; tableExists: boolean }> {
    try {
      if (!this.serviceClient) {
        return { isConnected: false, error: 'Database client not initialized', tableExists: false };
      }

      // Test basic connection
      const { data, error } = await this.serviceClient
        .from('clients')
        .select('id')
        .limit(1);

      if (error) {
        return { isConnected: false, error: error.message, tableExists: false };
      }

      return { isConnected: true, tableExists: true };
    } catch (error) {
      return { 
        isConnected: false, 
        error: error instanceof Error ? error.message : 'Unknown connection error', 
        tableExists: false 
      };
    }
  }

  /**
   * Batch process clients (for large datasets)
   */
  async batchProcessClients(
    batchSize: number,
    processor: (clients: Client[]) => Promise<void>,
    options: ClientQueryOptions = {}
  ): Promise<{ processed: number; errors: Array<{ clientId: string; error: string }> }> {
    let offset = options.offset || 0;
    let processed = 0;
    const errors: Array<{ clientId: string; error: string }> = [];

    while (true) {
      try {
        const result = await this.getAllClients({
          ...options,
          limit: batchSize,
          offset,
        });

        if (result.clients.length === 0) {
          break; // No more clients to process
        }

        // Process this batch
        await processor(result.clients);
        processed += result.clients.length;

        // Move to next batch
        offset += batchSize;

        // If no more pages, break
        if (!result.hasMore) {
          break;
        }
      } catch (error) {
        console.error(`Error processing batch starting at offset ${offset}:`, error);
        errors.push({
          clientId: 'batch',
          error: error instanceof Error ? error.message : 'Unknown batch error',
        });
        break;
      }
    }

    return { processed, errors };
  }
}

// Export a singleton instance
let clientDbService: ClientDatabaseService | null = null;

export function getClientDatabaseService(): ClientDatabaseService {
  if (!clientDbService) {
    clientDbService = new ClientDatabaseService();
  }
  return clientDbService;
}