/**
 * OpenPhone Sync Monitoring and Logging Service
 * 
 * This service provides comprehensive logging, monitoring, and alerting
 * for the OpenPhone contact sync process.
 */

import { getSyncService, type SyncResult } from './openphone-sync-service';
import { getSyncScheduler } from './openphone-scheduler';

export interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  component: string;
  action: string;
  message: string;
  metadata?: Record<string, any>;
  clientId?: string;
  contactType?: string;
  syncResult?: SyncResult;
  error?: Error;
  duration?: number; // in milliseconds
}

export interface MonitoringMetrics {
  syncStats: {
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    lastSyncTime?: Date;
    averageDuration: number;
    successRate: number;
  };
  contactStats: {
    totalContactsCreated: number;
    totalContactsUpdated: number;
    totalContactsSkipped: number;
    lastContactsCreated: number;
    lastContactsUpdated: number;
  };
  errorStats: {
    totalErrors: number;
    lastError?: LogEntry;
    mostCommonErrors: Array<{
      error: string;
      count: number;
    }>;
  };
  performanceMetrics: {
    averageBatchSize: number;
    averageProcessingTime: number; // per client in milliseconds
    peakMemoryUsage?: number;
    apiCallStats: {
      totalCalls: number;
      successfulCalls: number;
      failedCalls: number;
      averageResponseTime: number;
    };
  };
  systemHealth: {
    openPhoneConnection: 'healthy' | 'degraded' | 'unhealthy';
    databaseConnection: 'healthy' | 'degraded' | 'unhealthy';
    lastHealthCheck: Date;
    uptime: number; // in hours
  };
}

export interface AlertConfig {
  enabled: boolean;
  channels: Array<{
    type: 'email' | 'slack' | 'webhook' | 'sms';
    config: Record<string, any>;
  }>;
  thresholds: {
    failureRate: number; // percentage
    syncDuration: number; // maximum acceptable duration in minutes
    errorCount: number; // errors per sync
    successRate: number; // minimum acceptable success rate percentage
  };
  notifications: {
    onFailure: boolean;
    onLongRun: boolean;
    onHighErrorRate: boolean;
    onLowSuccessRate: boolean;
    dailySummary: boolean;
  };
}

export class OpenPhoneSyncMonitoringService {
  private logs: LogEntry[] = [];
  private maxLogSize = 10000;
  private metrics: MonitoringMetrics;
  private alertConfig: AlertConfig;
  private systemStartTime = new Date();
  private syncService = getSyncService();
  private scheduler = getSyncScheduler();
  
  constructor(config?: Partial<AlertConfig>) {
    this.alertConfig = {
      enabled: true,
      channels: [],
      thresholds: {
        failureRate: 10, // 10% failure rate threshold
        syncDuration: 60, // 1 hour max
        errorCount: 5, // max 5 errors per sync
        successRate: 90, // 90% minimum success rate
      },
      notifications: {
        onFailure: true,
        onLongRun: true,
        onHighErrorRate: true,
        onLowSuccessRate: true,
        dailySummary: true,
      },
      ...config,
    };

    this.metrics = this.initializeMetrics();
    this.startHealthCheckInterval();
  }

  private initializeMetrics(): MonitoringMetrics {
    return {
      syncStats: {
        totalSyncs: 0,
        successfulSyncs: 0,
        failedSyncs: 0,
        averageDuration: 0,
        successRate: 0,
      },
      contactStats: {
        totalContactsCreated: 0,
        totalContactsUpdated: 0,
        totalContactsSkipped: 0,
        lastContactsCreated: 0,
        lastContactsUpdated: 0,
      },
      errorStats: {
        totalErrors: 0,
        mostCommonErrors: [],
      },
      performanceMetrics: {
        averageBatchSize: 0,
        averageProcessingTime: 0,
        apiCallStats: {
          totalCalls: 0,
          successfulCalls: 0,
          failedCalls: 0,
          averageResponseTime: 0,
        },
      },
      systemHealth: {
        openPhoneConnection: 'healthy',
        databaseConnection: 'healthy',
        lastHealthCheck: new Date(),
        uptime: 0,
      },
    };
  }

  /**
   * Log a message with structured data
   */
  log(
    level: LogEntry['level'],
    component: string,
    action: string,
    message: string,
    metadata?: Record<string, any>
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      component,
      action,
      message,
      metadata,
    };

    this.logs.unshift(logEntry); // Add to beginning for recent-first ordering
    
    // Maintain log size limit
    if (this.logs.length > this.maxLogSize) {
      this.logs = this.logs.slice(0, this.maxLogSize);
    }

    // Console output for development
    if (level === 'error') {
      console.error(`[${component}] ${message}`, metadata);
    } else if (level === 'warn') {
      console.warn(`[${component}] ${message}`, metadata);
    } else {
      console.log(`[${component}] ${message}`, metadata);
    }

    // Check if this log entry should trigger an alert
    this.checkAlertConditions(logEntry);
  }

  /**
   * Log sync results and update metrics
   */
  logSyncResult(result: SyncResult, duration: number): void {
    // Update basic sync stats
    this.metrics.syncStats.totalSyncs++;
    this.metrics.syncStats.lastSyncTime = new Date();
    this.metrics.syncStats.averageDuration = 
      (this.metrics.syncStats.averageDuration * (this.metrics.syncStats.totalSyncs - 1) + duration) / 
      this.metrics.syncStats.totalSyncs;

    // Update contact stats
    this.metrics.contactStats.totalContactsCreated += result.totalContactsCreated;
    this.metrics.contactStats.totalContactsUpdated += result.totalContactsUpdated;
    this.metrics.contactStats.totalContactsSkipped += result.totalContactsSkipped;
    this.metrics.contactStats.lastContactsCreated = result.totalContactsCreated;
    this.metrics.contactStats.lastContactsUpdated = result.totalContactsUpdated;

    // Update error stats
    this.metrics.errorStats.totalErrors += result.totalErrors;

    if (result.success) {
      this.metrics.syncStats.successfulSyncs++;
    } else {
      this.metrics.syncStats.failedSyncs++;
    }

    // Calculate success rate
    this.metrics.syncStats.successRate = 
      (this.metrics.syncStats.successfulSyncs / this.metrics.syncStats.totalSyncs) * 100;

    // Log the result
    this.log('info', 'SyncService', 'syncCompleted', 
      `Sync completed: ${result.totalClientsProcessed} clients processed, ` +
      `${result.totalContactsCreated} created, ${result.totalContactsUpdated} updated, ` +
      `${result.totalContactsSkipped} skipped, ${result.totalErrors} errors`,
      {
        result,
        duration,
        success: result.success,
      }
    );

    // Log individual errors
    result.errors.forEach(error => {
      this.log('error', 'SyncService', 'clientSyncError', 
        `Failed to sync client ${error.clientName}: ${error.error}`,
        {
          clientId: error.clientId,
          clientName: error.clientName,
          error: error.error,
          contactType: error.contactType,
        }
      );
    });

    // Update most common errors
    this.updateMostCommonErrors(result.errors);
  }

  /**
   * Log API call performance
   */
  logAPICall(endpoint: string, duration: number, success: boolean): void {
    this.metrics.performanceMetrics.apiCallStats.totalCalls++;
    
    if (success) {
      this.metrics.performanceMetrics.apiCallStats.successfulCalls++;
    } else {
      this.metrics.performanceMetrics.apiCallStats.failedCalls++;
    }

    // Update average response time
    const stats = this.metrics.performanceMetrics.apiCallStats;
    stats.averageResponseTime = 
      (stats.averageResponseTime * (stats.totalCalls - 1) + duration) / stats.totalCalls;

    this.log('debug', 'OpenPhoneClient', 'apiCall', 
      `API call to ${endpoint} ${success ? 'succeeded' : 'failed'}`,
      {
        endpoint,
        duration,
        success,
        stats,
      }
    );
  }

  /**
   * Get recent logs with filtering
   */
  getLogs(options: {
    level?: LogEntry['level'];
    component?: string;
    action?: string;
    limit?: number;
    since?: Date;
  } = {}): LogEntry[] {
    let filteredLogs = [...this.logs];

    if (options.level) {
      filteredLogs = filteredLogs.filter(log => log.level === options.level);
    }
    if (options.component) {
      filteredLogs = filteredLogs.filter(log => log.component === options.component);
    }
    if (options.action) {
      filteredLogs = filteredLogs.filter(log => log.action === options.action);
    }
    if (options.since) {
      filteredLogs = filteredLogs.filter(log => log.timestamp >= options.since!);
    }

    const limit = options.limit || 100;
    return filteredLogs.slice(0, limit);
  }

  /**
   * Get current monitoring metrics
   */
  getMetrics(): MonitoringMetrics {
    // Update uptime
    this.metrics.systemHealth.uptime = 
      (Date.now() - this.systemStartTime.getTime()) / (1000 * 60 * 60);
    this.metrics.systemHealth.lastHealthCheck = new Date();

    return { ...this.metrics };
  }

  /**
   * Get log summary for dashboard
   */
  getLogSummary(hours: number = 24): {
    totalLogs: number;
    errorCount: number;
    warnCount: number;
    infoCount: number;
    recentErrors: LogEntry[];
    topComponents: Array<{ component: string; count: number }>;
  } {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const recentLogs = this.getLogs({ since });

    const errorCount = recentLogs.filter(log => log.level === 'error').length;
    const warnCount = recentLogs.filter(log => log.level === 'warn').length;
    const infoCount = recentLogs.filter(log => log.level === 'info').length;

    // Get recent errors
    const recentErrors = recentLogs
      .filter(log => log.level === 'error')
      .slice(0, 10);

    // Count logs by component
    const componentCounts = recentLogs.reduce((acc, log) => {
      acc[log.component] = (acc[log.component] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topComponents = Object.entries(componentCounts)
      .map(([component, count]) => ({ component, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalLogs: recentLogs.length,
      errorCount,
      warnCount,
      infoCount,
      recentErrors,
      topComponents,
    };
  }

  /**
   * Perform health check
   */
  async performHealthCheck(): Promise<{
    healthy: boolean;
    issues: string[];
    details: any;
  }> {
    const issues: string[] = [];
    
    try {
      // Test OpenPhone connection
      const openPhoneTest = await this.syncService.testConfiguration();
      if (!openPhoneTest.openPhoneConnection) {
        issues.push('OpenPhone API connection failed');
        this.metrics.systemHealth.openPhoneConnection = 'unhealthy';
      } else {
        this.metrics.systemHealth.openPhoneConnection = 'healthy';
      }

      if (!openPhoneTest.databaseConnection) {
        issues.push('Database connection failed');
        this.metrics.systemHealth.databaseConnection = 'unhealthy';
      } else {
        this.metrics.systemHealth.databaseConnection = 'healthy';
      }

      // Check recent error rate
      const recentLogs = this.getLogs({ since: new Date(Date.now() - 60 * 60 * 1000) }); // Last hour
      const errorRate = (recentLogs.filter(log => log.level === 'error').length / recentLogs.length) * 100;
      
      if (errorRate > 50) {
        issues.push(`High error rate: ${errorRate.toFixed(1)}%`);
      }

      // Check sync success rate
      if (this.metrics.syncStats.totalSyncs > 0) {
        if (this.metrics.syncStats.successRate < this.alertConfig.thresholds.successRate) {
          issues.push(`Low sync success rate: ${this.metrics.syncStats.successRate.toFixed(1)}%`);
        }
      }

    } catch (error) {
      issues.push(`Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      healthy: issues.length === 0,
      issues,
      details: this.getMetrics(),
    };
  }

  /**
   * Update most common errors tracking
   */
  private updateMostCommonErrors(errors: SyncResult['errors']): void {
    errors.forEach(error => {
      const existing = this.metrics.errorStats.mostCommonErrors.find(e => e.error === error.error);
      if (existing) {
        existing.count++;
      } else {
        this.metrics.errorStats.mostCommonErrors.push({
          error: error.error,
          count: 1,
        });
      }
    });

    // Keep only top 10 errors
    this.metrics.errorStats.mostCommonErrors.sort((a, b) => b.count - a.count);
    this.metrics.errorStats.mostCommonErrors = this.metrics.errorStats.mostCommonErrors.slice(0, 10);
  }

  /**
   * Check if log entry should trigger alerts
   */
  private checkAlertConditions(logEntry: LogEntry): void {
    if (!this.alertConfig.enabled) return;

    try {
      // Critical error alert
      if (logEntry.level === 'error' && this.alertConfig.notifications.onFailure) {
        this.sendAlert('error', `Critical error in ${logEntry.component}`, logEntry);
      }

      // Sync failure alert
      if (logEntry.action === 'syncCompleted' && !logEntry.syncResult?.success) {
        this.sendAlert('failure', 'Sync operation failed', logEntry);
      }

      // Long sync duration alert
      if (logEntry.action === 'syncCompleted' && logEntry.duration && 
          logEntry.duration > this.alertConfig.thresholds.syncDuration * 60 * 1000) {
        this.sendAlert('longRun', `Sync took ${(logEntry.duration / (60 * 1000)).toFixed(1)} minutes`, logEntry);
      }

      // High error rate check
      if (this.shouldCheckHighErrorRate()) {
        this.sendAlert('highErrorRate', 'High error rate detected', logEntry);
      }

    } catch (error) {
      console.error('Failed to process alert conditions:', error);
    }
  }

  /**
   * Check if we should alert about high error rate
   */
  private shouldCheckHighErrorRate(): boolean {
    const recentLogs = this.getLogs({ since: new Date(Date.now() - 30 * 60 * 1000) }); // Last 30 minutes
    const errorLogs = recentLogs.filter(log => log.level === 'error');
    
    return errorLogs.length >= this.alertConfig.thresholds.errorCount;
  }

  /**
   * Send alert through configured channels
   */
  private sendAlert(type: string, message: string, logEntry: LogEntry): void {
    const alertData = {
      type,
      message,
      timestamp: logEntry.timestamp,
      component: logEntry.component,
      metadata: logEntry.metadata,
    };

    // Console alert for now - in production, send to configured channels
    console.warn(`🚨 ALERT [${type}]: ${message}`, alertData);

    // In a real implementation, send to:
    // - Email notifications
    // - Slack/Discord webhooks  
    // - SMS alerts
    // - PagerDuty/incident management systems
    // - Monitoring dashboards
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheckInterval(): void {
    // Check health every 5 minutes
    setInterval(async () => {
      try {
        const healthCheck = await this.performHealthCheck();
        if (!healthCheck.healthy) {
          this.log('warn', 'Monitoring', 'healthCheck', 
            `Health check failed: ${healthCheck.issues.join(', ')}`,
            { healthCheck }
          );
        }
      } catch (error) {
        this.log('error', 'Monitoring', 'healthCheck', 
          `Health check error: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Update alert configuration
   */
  updateAlertConfig(config: Partial<AlertConfig>): void {
    this.alertConfig = { ...this.alertConfig, ...config };
    this.log('info', 'Monitoring', 'configUpdate', 'Alert configuration updated', { config });
  }

  /**
   * Clear logs (useful for testing or maintenance)
   */
  clearLogs(): void {
    this.logs = [];
    this.log('info', 'Monitoring', 'maintenance', 'Logs cleared');
  }

  /**
   * Export logs for debugging
   */
  exportLogs(options: {
    format?: 'json' | 'csv';
    since?: Date;
    level?: LogEntry['level'];
  } = { format: 'json' }): string {
    let logsToExport = [...this.logs];
    
    if (options.since) {
      logsToExport = logsToExport.filter(log => log.timestamp >= options.since!);
    }
    
    if (options.level) {
      logsToExport = logsToExport.filter(log => log.level === options.level);
    }

    if (options.format === 'json') {
      return JSON.stringify(logsToExport, null, 2);
    } else {
      // CSV format
      const headers = ['timestamp', 'level', 'component', 'action', 'message', 'clientId'];
      const csvRows = logsToExport.map(log => [
        log.timestamp.toISOString(),
        log.level,
        log.component,
        log.action,
        log.message.replace(/"/g, '""'), // Escape quotes
        log.clientId || '',
      ].join(','));

      return [headers.join(','), ...csvRows].join('\n');
    }
  }
}

// Export singleton instance
let monitoringService: OpenPhoneSyncMonitoringService | null = null;

export function getMonitoringService(config?: Partial<AlertConfig>): OpenPhoneSyncMonitoringService {
  if (!monitoringService) {
    monitoringService = new OpenPhoneSyncMonitoringService(config);
  }
  return monitoringService;
}