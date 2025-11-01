/**
 * OpenPhone Contact Sync Service
 * 
 * This is the main service that orchestrates the entire sync process from
 * Supabase clients to OpenPhone contacts. It handles the complete workflow
 * including mapping, duplicate detection, error handling, and logging.
 */

import type { Client } from '../db/schema';
import { mapClientToContacts, type MappedContact, validateMappedContact } from '../openphone-mapping';
import { getOpenPhoneClient } from '../openphone-client';
import { getClientDatabaseService } from '../client-database-service';
import { getDuplicateDetectionService, type DuplicateCheckResult } from '../duplicate-detection-service';

export interface SyncResult {
  success: boolean;
  totalClientsProcessed: number;
  totalContactsCreated: number;
  totalContactsUpdated: number;
  totalContactsSkipped: number;
  totalErrors: number;
  errors: Array<{
    clientId: string;
    clientName: string;
    error: string;
    contactType?: string;
  }>;
  startTime: Date;
  endTime: Date;
  duration: number;
  syncMode: 'full' | 'incremental';
}

export interface SyncOptions {
  syncMode: 'full' | 'incremental';
  batchSize?: number;
  includeDeleted?: boolean;
  updatedSince?: Date;
  dryRun?: boolean;
  clientType?: 'criminal' | 'civil';
  maxRetries?: number;
  continueOnError?: boolean;
}

export interface SyncProgress {
  currentStep: string;
  currentClient?: string;
  processed: number;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  estimatedRemaining?: number;
}

export class OpenPhoneContactSyncService {
  private openPhoneClient = getOpenPhoneClient();
  private clientDbService = getClientDatabaseService();
  private duplicateService = getDuplicateDetectionService();
  private syncInProgress = false;
  private progressCallbacks: Array<(progress: SyncProgress) => void> = [];

  constructor() {
    // Initialize services
    this.clientDbService.initialize(null); // Will be set when database is connected
  }

  /**
   * Register a progress callback
   */
  onProgress(callback: (progress: SyncProgress) => void): void {
    this.progressCallbacks.push(callback);
  }

  /**
   * Remove a progress callback
   */
  removeProgressCallback(callback: (progress: SyncProgress) => void): void {
    const index = this.progressCallbacks.indexOf(callback);
    if (index > -1) {
      this.progressCallbacks.splice(index, 1);
    }
  }

  /**
   * Notify all progress callbacks
   */
  private notifyProgress(progress: SyncProgress): void {
    for (const callback of this.progressCallbacks) {
      try {
        callback(progress);
      } catch (error) {
        console.error('Error in progress callback:', error);
      }
    }
  }

  /**
   * Main sync method - orchestrates the entire process
   */
  async syncContacts(options: SyncOptions = { syncMode: 'full' }): Promise<SyncResult> {
    const startTime = new Date();
    console.log('🚀 Starting OpenPhone contact sync...', options);

    // Prevent multiple concurrent syncs
    if (this.syncInProgress) {
      throw new Error('Sync is already in progress');
    }

    this.syncInProgress = true;
    
    try {
      // Validate configuration
      await this.validateConfiguration();
      
      // Initialize progress tracking
      this.notifyProgress({
        currentStep: 'Initializing sync',
        processed: 0,
        total: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
      });

      // Get clients to sync
      this.notifyProgress({ currentStep: 'Fetching clients from database', processed: 0, total: 0, created: 0, updated: 0, skipped: 0, errors: 0 });
      const clientsResult = await this.getClientsToSync(options);
      const clients = clientsResult.clients;

      if (clients.length === 0) {
        console.log('No clients found to sync');
        return this.createSyncResult(true, 0, 0, 0, 0, 0, [], startTime, new Date(), options.syncMode);
      }

      console.log(`Found ${clients.length} clients to sync`);

      // Process clients
      const syncResult = await this.processClients(clients, options);

      console.log('✅ Sync completed successfully', syncResult);
      return syncResult;

    } catch (error) {
      console.error('❌ Sync failed:', error);
      return this.createSyncResult(
        false, 
        0, 
        0, 
        0, 
        0, 
        1, 
        [{
          clientId: 'sync',
          clientName: 'Sync Process',
          error: error instanceof Error ? error.message : 'Unknown sync error'
        }],
        startTime, 
        new Date(), 
        options.syncMode
      );
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Validate that all required configuration and connections are available
   */
  private async validateConfiguration(): Promise<void> {
    // Check OpenPhone API connection
    const isOpenPhoneConnected = await this.openPhoneClient.validateConnection();
    if (!isOpenPhoneConnected) {
      throw new Error('Cannot connect to OpenPhone API. Please check your API key and configuration.');
    }

    // Check database connection
    const dbTest = await this.clientDbService.testConnection();
    if (!dbTest.isConnected) {
      throw new Error(`Database connection failed: ${dbTest.error}`);
    }

    console.log('✅ Configuration validation passed');
  }

  /**
   * Get clients that need to be synced
   */
  private async getClientsToSync(options: SyncOptions) {
    if (options.syncMode === 'incremental' && options.updatedSince) {
      return this.clientDbService.getUpdatedClients(options.updatedSince, options);
    } else {
      return this.clientDbService.getAllClients(options);
    }
  }

  /**
   * Process all clients and sync their contacts
   */
  private async processClients(clients: Client[], options: SyncOptions): Promise<SyncResult> {
    const result: SyncResult = this.createSyncResult(true, 0, 0, 0, 0, 0, [], new Date(), new Date(), options.syncMode);
    
    const batchSize = options.batchSize || 50;
    const maxRetries = options.maxRetries || 3;

    for (let i = 0; i < clients.length; i += batchSize) {
      const batch = clients.slice(i, i + batchSize);
      
      this.notifyProgress({
        currentStep: `Processing batch ${Math.floor(i / batchSize) + 1}`,
        processed: i,
        total: clients.length,
        created: result.totalContactsCreated,
        updated: result.totalContactsUpdated,
        skipped: result.totalContactsSkipped,
        errors: result.totalErrors,
        estimatedRemaining: this.estimateRemainingTime(i, clients.length, batch.length),
      });

      // Process batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(client => this.processClient(client, options, maxRetries))
      );

      // Process batch results
      for (let j = 0; j < batchResults.length; j++) {
        const batchResult = batchResults[j];
        const client = batch[j];

        if (batchResult.status === 'fulfilled') {
          const clientResult = batchResult.value;
          result.totalClientsProcessed++;
          result.totalContactsCreated += clientResult.created;
          result.totalContactsUpdated += clientResult.updated;
          result.totalContactsSkipped += clientResult.skipped;
        } else {
          result.totalClientsProcessed++;
          result.totalErrors++;
          
          if (options.continueOnError !== false) {
            result.errors.push({
              clientId: client.id,
              clientName: client.client_name,
              error: batchResult.reason?.message || 'Unknown error during client processing'
            });
          } else {
            throw batchResult.reason;
          }
        }
      }
    }

    result.endTime = new Date();
    result.duration = result.endTime.getTime() - result.startTime.getTime();

    return result;
  }

  /**
   * Process a single client and sync their contacts
   */
  private async processClient(client: Client, options: SyncOptions, maxRetries: number) {
    try {
      this.notifyProgress({
        currentStep: 'Processing client',
        currentClient: client.client_name,
        processed: 0,
        total: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
      });

      // Validate client data
      const validation = await this.clientDbService.validateClientData(client);
      if (!validation.isValid) {
        console.warn(`Client ${client.client_name} has validation errors:`, validation.errors);
      }

      // Map client to contacts
      const mappedContacts = mapClientToContacts(client);
      if (mappedContacts.length === 0) {
        console.warn(`No contacts mapped for client ${client.client_name}`);
        return { created: 0, updated: 0, skipped: 1 };
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;

      // Process each mapped contact
      for (const mappedContact of mappedContacts) {
        const contactResult = await this.processContact(mappedContact, client, options, maxRetries);
        
        if (contactResult.action === 'created') {
          created++;
        } else if (contactResult.action === 'updated') {
          updated++;
        } else if (contactResult.action === 'skipped') {
          skipped++;
        }
      }

      return { created, updated, skipped };

    } catch (error) {
      console.error(`Error processing client ${client.client_name}:`, error);
      throw new Error(`Failed to process client ${client.client_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process a single mapped contact
   */
  private async processContact(
    mappedContact: MappedContact, 
    client: Client, 
    options: SyncOptions, 
    maxRetries: number
  ): Promise<{ action: 'created' | 'updated' | 'skipped'; contactId?: string }> {
    
    // Validate mapped contact
    const validation = validateMappedContact(mappedContact);
    if (!validation.isValid) {
      console.warn(`Invalid contact data for ${mappedContact.clientName} (${mappedContact.contactType}):`, validation.errors);
      return { action: 'skipped' };
    }

    // Check for duplicates if not in dry run mode
    if (!options.dryRun) {
      const duplicateCheck = await this.duplicateService.checkForDuplicates(
        mappedContact.openPhoneContact,
        this.openPhoneClient
      );

      if (duplicateCheck.isDuplicate) {
        console.log(`Duplicate detected for ${mappedContact.clientName} (${mappedContact.contactType}), updating existing contact`);
        
        try {
          await this.openPhoneClient.updateContact(
            duplicateCheck.existingContactId!,
            {
              defaultFields: mappedContact.openPhoneContact.defaultFields,
              customFields: mappedContact.openPhoneContact.customFields,
              externalId: mappedContact.openPhoneContact.externalId,
            }
          );
          
          return { action: 'updated', contactId: duplicateCheck.existingContactId };
        } catch (error) {
          console.error(`Failed to update existing contact for ${mappedContact.clientName}:`, error);
          return { action: 'skipped' };
        }
      }
    }

    // Create new contact
    try {
      if (options.dryRun) {
        console.log(`[DRY RUN] Would create contact: ${mappedContact.clientName} (${mappedContact.contactType})`);
        return { action: 'created' };
      }

      const createdContact = await this.openPhoneClient.createContact(mappedContact.openPhoneContact);
      
      // Update duplicate detection cache
      this.duplicateService.updateCache([createdContact]);
      
      return { action: 'created', contactId: createdContact.id };
    } catch (error) {
      console.error(`Failed to create contact for ${mappedContact.clientName}:`, error);
      return { action: 'skipped' };
    }
  }

  /**
   * Create a sync result object
   */
  private createSyncResult(
    success: boolean,
    totalClientsProcessed: number,
    totalContactsCreated: number,
    totalContactsUpdated: number,
    totalContactsSkipped: number,
    totalErrors: number,
    errors: SyncResult['errors'],
    startTime: Date,
    endTime: Date,
    syncMode: 'full' | 'incremental'
  ): SyncResult {
    return {
      success,
      totalClientsProcessed,
      totalContactsCreated,
      totalContactsUpdated,
      totalContactsSkipped,
      totalErrors,
      errors,
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      syncMode,
    };
  }

  /**
   * Estimate remaining time for sync
   */
  private estimateRemainingTime(current: number, total: number, batchSize: number): number {
    if (current === 0) return 0;
    
    const averageTimePerClient = 2000; // Assume 2 seconds per client on average
    const remainingClients = total - current;
    
    return remainingClients * averageTimePerClient;
  }

  /**
   * Get current sync status
   */
  getSyncStatus(): {
    isInProgress: boolean;
    progress?: SyncProgress;
    cacheStats?: any;
  } {
    return {
      isInProgress: this.syncInProgress,
      cacheStats: this.duplicateService.getCacheStats(),
    };
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.duplicateService.clearCache();
  }

  /**
   * Test the sync configuration without running a full sync
   */
  async testConfiguration(): Promise<{
    openPhoneConnection: boolean;
    databaseConnection: boolean;
    sampleClients: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let openPhoneConnection = false;
    let databaseConnection = false;
    let sampleClients = 0;

    try {
      openPhoneConnection = await this.openPhoneClient.validateConnection();
    } catch (error) {
      errors.push(`OpenPhone connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
      const dbTest = await this.clientDbService.testConnection();
      databaseConnection = dbTest.isConnected;
      if (!databaseConnection) {
        errors.push(`Database connection failed: ${dbTest.error}`);
      }
    } catch (error) {
      errors.push(`Database test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
      if (databaseConnection) {
        const result = await this.clientDbService.getAllClients({ limit: 5 });
        sampleClients = result.totalCount;
      }
    } catch (error) {
      errors.push(`Failed to fetch sample clients: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      openPhoneConnection,
      databaseConnection,
      sampleClients,
      errors,
    };
  }
}

// Export a singleton instance
let syncService: OpenPhoneContactSyncService | null = null;

export function getSyncService(): OpenPhoneContactSyncService {
  if (!syncService) {
    syncService = new OpenPhoneContactSyncService();
  }
  return syncService;
}