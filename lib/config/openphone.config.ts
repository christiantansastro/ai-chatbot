/**
 * OpenPhone API Configuration
 * 
 * This module handles configuration for the OpenPhone contact sync service.
 * It loads environment variables and provides typed configuration objects.
 */

export interface OpenPhoneConfig {
  apiKey: string;
  baseUrl: string;
  timeout: number;
  rateLimit: {
    requestsPerMinute: number;
    requestsPerHour: number;
  };
  sync: {
    dailySchedule: string; // cron expression
    batchSize: number;
    retryAttempts: number;
    retryDelay: number; // milliseconds
  };
  monitoring: {
    enableDetailedLogging: boolean;
    alertOnFailure: boolean;
  };
}

export interface SyncStatus {
  lastRun: Date | null;
  lastRunStatus: 'success' | 'failure' | 'in_progress' | null;
  totalContactsSynced: number;
  successfulSyncs: number;
  failedSyncs: number;
  errors: Array<{
    clientId: string;
    clientName: string;
    error: string;
    timestamp: Date;
  }>;
}

// Default configuration
const DEFAULT_CONFIG: Partial<OpenPhoneConfig> = {
  baseUrl: 'https://api.openphone.com',
  timeout: 30000, // 30 seconds
  rateLimit: {
    requestsPerMinute: 60,
    requestsPerHour: 3600,
  },
  sync: {
    dailySchedule: '0 2 * * *', // 2 AM daily
    batchSize: 50,
    retryAttempts: 3,
    retryDelay: 1000, // 1 second
  },
  monitoring: {
    enableDetailedLogging: true,
    alertOnFailure: true,
  },
};

let cachedConfig: OpenPhoneConfig | null = null;

export function getOpenPhoneConfig(): OpenPhoneConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Load from environment variables
  const apiKey = process.env.OPENPHONE_API_KEY;
  if (!apiKey) {
    throw new Error('OPENPHONE_API_KEY environment variable is required');
  }

  cachedConfig = {
    ...DEFAULT_CONFIG,
    apiKey,
    // Override with environment variables if provided
    timeout: parseInt(process.env.OPENPHONE_TIMEOUT || '30000'),
    rateLimit: {
      requestsPerMinute: parseInt(process.env.OPENPHONE_RATE_LIMIT_MINUTE || '60'),
      requestsPerHour: parseInt(process.env.OPENPHONE_RATE_LIMIT_HOUR || '3600'),
    },
    sync: {
      dailySchedule: process.env.OPENPHONE_SYNC_SCHEDULE || '0 2 * * *',
      batchSize: parseInt(process.env.OPENPHONE_BATCH_SIZE || '50'),
      retryAttempts: parseInt(process.env.OPENPHONE_RETRY_ATTEMPTS || '3'),
      retryDelay: parseInt(process.env.OPENPHONE_RETRY_DELAY || '1000'),
    },
    monitoring: {
      enableDetailedLogging: process.env.OPENPHONE_ENABLE_LOGGING !== 'false',
      alertOnFailure: process.env.OPENPHONE_ALERT_ON_FAILURE !== 'false',
    },
  } as OpenPhoneConfig;

  return cachedConfig;
}

// Environment variable validation
export function validateOpenPhoneConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!process.env.OPENPHONE_API_KEY) {
    errors.push('OPENPHONE_API_KEY is required');
  }

  const apiKey = process.env.OPENPHONE_API_KEY;
  if (apiKey && !apiKey.startsWith('sk-')) {
    errors.push('OPENPHONE_API_KEY should start with "sk-"');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}