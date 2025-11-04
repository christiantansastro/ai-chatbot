/**
 * Daily OpenPhone Sync Scheduler
 * 
 * This service handles scheduling and executing daily sync jobs using cron.
 * It manages the automatic sync process and provides monitoring capabilities.
 */

import { getSyncService, type SyncResult } from './openphone-sync-service';
import { getClientDatabaseService } from './client-database-service';

export interface SyncJobConfig {
  enabled: boolean;
  schedule: string; // cron expression
  maxRuntime: number; // maximum runtime in minutes
  retryAttempts: number;
  retryDelay: number; // delay between retries in minutes
  notifications: {
    onSuccess: boolean;
    onFailure: boolean;
    email?: string;
  };
  syncOptions: {
    batchSize: number;
    clientType?: 'criminal' | 'civil';
    continueOnError: boolean;
    clearCaches: boolean;
  };
}

export interface SyncJobStatus {
  jobId: string;
  status: 'idle' | 'running' | 'success' | 'failure' | 'timeout';
  startTime?: Date;
  endTime?: Date;
  lastRun?: Date;
  nextRun?: Date;
  lastResult?: SyncResult;
  error?: string;
  runtime?: number; // in minutes
  isEnabled: boolean;
}

export interface SyncJobMetrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  averageRuntime: number; // in minutes
  last30Days: {
    runs: number;
    successes: number;
    failures: number;
    averageRuntime: number;
  };
}

export class OpenPhoneSyncScheduler {
  private jobId: string;
  private config: SyncJobConfig;
  private status: SyncJobStatus;
  private cronJob: NodeJS.Timeout | null = null;
  private syncService = getSyncService();
  private clientDbService = getClientDatabaseService();
  private metrics: SyncJobMetrics = {
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    averageRuntime: 0,
    last30Days: {
      runs: 0,
      successes: 0,
      failures: 0,
      averageRuntime: 0,
    },
  };
  private jobHistory: Array<{
    timestamp: Date;
    status: 'success' | 'failure' | 'timeout';
    runtime: number;
    result?: SyncResult;
    error?: string;
  }> = [];

  constructor(jobId: string = 'openphone-daily-sync', config?: Partial<SyncJobConfig>) {
    this.jobId = jobId;
    this.config = {
      enabled: true,
      schedule: '0 2 * * *', // 2 AM daily
      maxRuntime: 60, // 1 hour
      retryAttempts: 3,
      retryDelay: 5, // 5 minutes
      notifications: {
        onSuccess: true,
        onFailure: true,
      },
      syncOptions: {
        batchSize: 50,
        continueOnError: true,
        clearCaches: true,
      },
      ...config,
    };

    this.status = {
      jobId: this.jobId,
      status: 'idle',
      isEnabled: this.config.enabled,
    };

    // Load previous metrics from storage (in a real implementation)
    this.loadMetrics();
  }

  /**
   * Start the scheduled sync job
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      console.log(`Sync job ${this.jobId} is disabled, not starting`);
      return;
    }

    if (this.cronJob) {
      console.log(`Sync job ${this.jobId} is already running`);
      return;
    }

    console.log(`Starting sync job ${this.jobId} with schedule: ${this.config.schedule}`);

    // For Node.js cron, we'll use a simpler approach with setInterval
    // In a real implementation, you'd use a proper cron library like node-cron
    
    // Calculate next run time
    this.calculateNextRun();

    // Start the scheduler
    this.startScheduler();
    
    // Run initial sync if this is the first time
    if (this.status.lastRun === undefined) {
      console.log('Running initial sync...');
      await this.runSync();
    }
  }

  /**
   * Stop the scheduled sync job
   */
  stop(): void {
    if (this.cronJob) {
      clearTimeout(this.cronJob);
      this.cronJob = null;
      console.log(`Stopped sync job ${this.jobId}`);
    }
  }

  /**
   * Manually trigger a sync job
   */
  async runSync(): Promise<SyncResult> {
    console.log(`Manually triggering sync job ${this.jobId}`);

    if (this.status.status === 'running') {
      throw new Error('Sync job is already running');
    }

    this.updateStatus({ status: 'running', startTime: new Date() });

    try {
      const startTime = Date.now();
      
      // Initialize database service if needed
      this.clientDbService.initialize(null); // Would be set with actual Supabase client

      // Run the sync with appropriate options
      const syncOptions = {
        syncMode: 'incremental' as const,
        updatedSince: this.status.lastRun || new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours if no previous run
        batchSize: this.config.syncOptions.batchSize,
        clientType: this.config.syncOptions.clientType,
        continueOnError: this.config.syncOptions.continueOnError,
      };

      // Clear caches before sync if configured
      if (this.config.syncOptions.clearCaches) {
        this.syncService.clearCaches();
      }

      const result = await this.syncService.syncContacts(syncOptions);

      const endTime = Date.now();
      const runtime = (endTime - startTime) / (1000 * 60); // Convert to minutes

      this.updateStatus({
        status: result.success ? 'success' : 'failure',
        endTime: new Date(),
        lastResult: result,
        runtime,
      });

      // Update metrics
      this.updateMetrics(result, runtime);

      // Send notifications
      if (result.success && this.config.notifications.onSuccess) {
        this.sendNotification('success', result);
      } else if (!result.success && this.config.notifications.onFailure) {
        this.sendNotification('failure', result);
      }

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.updateStatus({
        status: 'failure',
        endTime: new Date(),
        error: errorMessage,
      });

      this.updateMetrics(null, 0, errorMessage);

      // Send failure notification
      if (this.config.notifications.onFailure) {
        this.sendNotification('failure', undefined, errorMessage);
      }

      throw error;
    }
  }

  /**
   * Start the scheduler loop
   */
  private startScheduler(): void {
    const scheduleNextRun = () => {
      if (!this.config.enabled) {
        return;
      }

      // Calculate next run time
      this.calculateNextRun();

      if (this.status.nextRun) {
        const timeUntilNextRun = this.status.nextRun.getTime() - Date.now();
        
        if (timeUntilNextRun > 0) {
          this.cronJob = setTimeout(async () => {
            try {
              await this.runSync();
            } catch (error) {
              console.error(`Scheduled sync job failed:`, error);
            } finally {
              // Schedule the next run
              scheduleNextRun();
            }
          }, timeUntilNextRun);
        }
      }
    };

    scheduleNextRun();
  }

  /**
   * Calculate next run time based on cron schedule
   */
  private calculateNextRun(): void {
    // Simple implementation - in a real cron library, this would be more sophisticated
    const now = new Date();
    const nextRun = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Default to 24 hours from now
    
    // For the default schedule '0 2 * * *' (2 AM daily)
    if (this.config.schedule === '0 2 * * *') {
      nextRun.setHours(2, 0, 0, 0);
      if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
    }

    this.status.nextRun = nextRun;
  }

  /**
   * Update job status
   */
  private updateStatus(updates: Partial<SyncJobStatus>): void {
    this.status = { ...this.status, ...updates };
  }

  /**
   * Update metrics after a sync run
   */
  private updateMetrics(result: SyncResult | null, runtime: number, error?: string): void {
    this.metrics.totalRuns++;
    
    if (result && result.success) {
      this.metrics.successfulRuns++;
      this.jobHistory.unshift({
        timestamp: new Date(),
        status: 'success',
        runtime,
        result,
      });
    } else {
      this.metrics.failedRuns++;
      this.jobHistory.unshift({
        timestamp: new Date(),
        status: 'failure',
        runtime,
        error,
      });
    }

    // Keep only last 100 runs in history
    if (this.jobHistory.length > 100) {
      this.jobHistory = this.jobHistory.slice(0, 100);
    }

    // Update average runtime
    this.metrics.averageRuntime = this.jobHistory
      .filter(job => job.runtime > 0)
      .reduce((sum, job) => sum + job.runtime, 0) / this.jobHistory.length;

    // Update 30-day metrics
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentJobs = this.jobHistory.filter(job => job.timestamp >= thirtyDaysAgo);
    
    this.metrics.last30Days = {
      runs: recentJobs.length,
      successes: recentJobs.filter(job => job.status === 'success').length,
      failures: recentJobs.filter(job => job.status === 'failure').length,
      averageRuntime: recentJobs.length > 0 
        ? recentJobs.reduce((sum, job) => sum + job.runtime, 0) / recentJobs.length 
        : 0,
    };

    // Save metrics to storage (in a real implementation)
    this.saveMetrics();
  }

  /**
   * Send notification (placeholder implementation)
   */
  private sendNotification(type: 'success' | 'failure', result?: SyncResult, error?: string): void {
    console.log(`📧 Notification: Sync ${type}`, {
      jobId: this.jobId,
      time: new Date().toISOString(),
      result: result ? {
        success: result.success,
        clientsProcessed: result.totalClientsProcessed,
        contactsCreated: result.totalContactsCreated,
        contactsUpdated: result.totalContactsUpdated,
        errors: result.totalErrors,
      } : null,
      error,
    });

    // In a real implementation, you would:
    // - Send email notifications
    // - Post to Slack/Discord
    // - Send SMS alerts
    // - Create webhooks
    // - Log to monitoring services
  }

  /**
   * Load metrics from persistent storage
   */
  private loadMetrics(): void {
    // In a real implementation, load from database, file, or key-value store
    try {
      const saved = localStorage.getItem(`sync_metrics_${this.jobId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.metrics = { ...this.metrics, ...parsed };
        this.jobHistory = parsed.jobHistory || [];
      }
    } catch (error) {
      console.warn('Failed to load sync metrics:', error);
    }
  }

  /**
   * Save metrics to persistent storage
   */
  private saveMetrics(): void {
    try {
      const toSave = {
        ...this.metrics,
        jobHistory: this.jobHistory.slice(0, 50), // Save only recent history
      };
      localStorage.setItem(`sync_metrics_${this.jobId}`, JSON.stringify(toSave));
    } catch (error) {
      console.warn('Failed to save sync metrics:', error);
    }
  }

  /**
   * Get current job status
   */
  getStatus(): SyncJobStatus {
    return { ...this.status };
  }

  /**
   * Get job metrics
   */
  getMetrics(): SyncJobMetrics {
    return { ...this.metrics };
  }

  /**
   * Get job history
   */
  getHistory(limit: number = 10): typeof this.jobHistory {
    return this.jobHistory.slice(0, limit);
  }

  /**
   * Update job configuration
   */
  updateConfig(newConfig: Partial<SyncJobConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.status.isEnabled = this.config.enabled;

    if (this.config.enabled && !this.cronJob) {
      this.startScheduler();
    } else if (!this.config.enabled && this.cronJob) {
      this.stop();
    }

    console.log(`Updated sync job configuration:`, this.config);
  }

  /**
   * Get job configuration
   */
  getConfig(): SyncJobConfig {
    return { ...this.config };
  }

  /**
   * Test job configuration without running
   */
  async testConfiguration(): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Test OpenPhone connection
      const openPhoneTest = await this.syncService.testConfiguration();
      if (!openPhoneTest.openPhoneConnection) {
        errors.push('OpenPhone API connection failed');
      }
      if (!openPhoneTest.databaseConnection) {
        errors.push('Database connection failed');
      }
      if (openPhoneTest.sampleClients === 0) {
        warnings.push('No clients found in database');
      }
      errors.push(...openPhoneTest.errors);
    } catch (error) {
      errors.push(`Configuration test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Validate cron schedule
    if (!this.config.schedule || !this.isValidCron(this.config.schedule)) {
      errors.push('Invalid cron schedule format');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Simple cron validation (basic implementation)
   */
  private isValidCron(cron: string): boolean {
    // Basic validation - in a real implementation use a proper cron parser
    const parts = cron.split(' ');
    return parts.length === 5 && parts.every(part => 
      part === '*' || 
      /^\d+$/.test(part) || 
      /^\d+,\d+$/.test(part) || 
      /^\d+-\d+$/.test(part) || 
      /^\*\/\d+$/.test(part)
    );
  }
}

// Export singleton instance
let scheduler: OpenPhoneSyncScheduler | null = null;

export function getSyncScheduler(jobId?: string, config?: Partial<SyncJobConfig>): OpenPhoneSyncScheduler {
  if (!scheduler) {
    scheduler = new OpenPhoneSyncScheduler(jobId, config);
  }
  return scheduler;
}