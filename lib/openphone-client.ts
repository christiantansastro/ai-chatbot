/**
 * OpenPhone API Client Service
 * 
 * This module provides a client for interacting with the OpenPhone API.
 * It handles authentication, rate limiting, error handling, and request retries.
 */

// Import configuration inline for now to avoid path issues
interface OpenPhoneConfig {
  apiKey: string;
  baseUrl: string;
  timeout: number;
  rateLimit: {
    requestsPerMinute: number;
    requestsPerHour: number;
    maxConcurrentRequests: number;
  };
  sync: {
    dailySchedule: string;
    batchSize: number;
    retryAttempts: number;
    retryDelay: number;
  };
  monitoring: {
    enableDetailedLogging: boolean;
    alertOnFailure: boolean;
  };
}

function getOpenPhoneConfig(): OpenPhoneConfig {
  const maxConcurrentRequests = parseInt(process.env.OPENPHONE_MAX_CONCURRENT_REQUESTS || '5', 10);
  return {
    apiKey: process.env.OPENPHONE_API_KEY || '',
    baseUrl: 'https://api.openphone.com',
    timeout: 30000,
    rateLimit: {
      requestsPerMinute: 60,
      requestsPerHour: 3600,
      maxConcurrentRequests,
    },
    sync: {
      dailySchedule: '0 2 * * *',
      batchSize: 50,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    monitoring: {
      enableDetailedLogging: true,
      alertOnFailure: true,
    },
  };
}

import type {
  OpenPhoneContact,
  OpenPhoneContactResponse,
  ContactCreationRequest,
  ContactUpdateRequest
} from './openphone-mapping';

interface APIError {
  message: string;
  code: string;
  status: number;
  docs: string;
  title: string;
  trace: string;
  errors: Array<{
    path: string;
    message: string;
    value: any;
    schema: {
      type: string;
    };
  }>;
}

interface RateLimitInfo {
  remaining: number;
  reset: number;
  limit: number;
}

interface PaginatedMeta {
  nextCursor?: string | null;
  hasMore?: boolean;
}

export interface ListCallsParams {
  phoneNumberId: string;
  participants: string[];
  createdAfter?: string;
  createdBefore?: string;
  maxResults?: number;
  pageToken?: string;
}

export interface ListConversationsParams {
  phoneNumbers: string[];
  updatedAfter?: string;
  updatedBefore?: string;
  createdAfter?: string;
  createdBefore?: string;
  excludeInactive?: boolean;
  maxResults?: number;
  pageToken?: string;
}

// Rate limiting state
let rateLimitState = {
  remaining: 60,
  reset: Date.now() + 60000, // 1 minute
  lastRequest: 0,
  limit: 60,
};

const concurrencyState: {
  active: number;
  max: number;
  queue: Array<() => void>;
} = {
  active: 0,
  max: parseInt(process.env.OPENPHONE_MAX_CONCURRENT_REQUESTS || '5', 10),
  queue: [],
};

const quotaState = {
  minute: {
    resetAt: Date.now(),
    count: 0,
  },
  hour: {
    resetAt: Date.now(),
    count: 0,
  },
};

// API Client Class
export class OpenPhoneAPIClient {
  private config: OpenPhoneConfig;
  private baseUrl: string;
  private apiKey: string;

  constructor(config?: OpenPhoneConfig) {
    this.config = config || getOpenPhoneConfig();
    this.baseUrl = this.config.baseUrl;
    this.apiKey = this.config.apiKey;
    concurrencyState.max = Math.max(
      1,
      this.config.rateLimit.maxConcurrentRequests || concurrencyState.max
    );
    this.resetQuotaWindows();
  }

  /**
   * Make an authenticated request to the OpenPhone API
   */
  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
    data?: any,
    retryCount: number = 0
  ): Promise<T> {
    await this.acquireConcurrencySlot();
    let slotReleased = false;
    await this.enforceLocalQuota();
    // Rate limiting check
    await this.checkRateLimit();

    const url = `${this.baseUrl}/v1${endpoint}`;
    const headers = {
      'Authorization': `${this.apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const config: RequestInit = {
      method,
      headers,
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      config.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, config);
      this.recordLocalQuotaUsage();
      const rateLimitInfo = this.extractRateLimitInfo(response.headers);
      this.updateRateLimitState(rateLimitInfo);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw this.createAPIError(response.status, errorData);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      // Handle network errors and API errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(`Network error: ${error.message}`);
      }

      if (error instanceof Error && 'status' in error) {
        const apiError = error as Error & { status: number; code: string };
        
        // Retry on rate limit or server errors
        if ((apiError.status === 429 || apiError.status >= 500) && retryCount < this.config.sync.retryAttempts) {
          this.releaseConcurrencySlot();
          slotReleased = true;
          await this.delay(this.config.sync.retryDelay * Math.pow(2, retryCount)); // Exponential backoff
          return this.makeRequest<T>(endpoint, method, data, retryCount + 1);
        }
      }

      throw error;
    } finally {
      if (!slotReleased) {
        this.releaseConcurrencySlot();
      }
    }
  }

  /**
   * Extract rate limit information from response headers
   */
  private extractRateLimitInfo(headers: Headers): RateLimitInfo {
    return {
      remaining: parseInt(headers.get('x-ratelimit-remaining') || '60'),
      reset: parseInt(headers.get('x-ratelimit-reset') || `${Date.now() + 60000}`),
      limit: parseInt(headers.get('x-ratelimit-limit') || '60'),
    };
  }

  /**
   * Update internal rate limit state
   */
  private updateRateLimitState(info: RateLimitInfo): void {
    rateLimitState = {
      remaining: info.remaining,
      reset: info.reset,
      lastRequest: Date.now(),
      limit: info.limit,
    };
  }

  /**
   * Track local quota usage
   */
  private recordLocalQuotaUsage(): void {
    quotaState.minute.count++;
    quotaState.hour.count++;
  }

  /**
   * Check and wait for rate limit reset if necessary
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Reset rate limit state if window has passed
    if (now >= rateLimitState.reset) {
      rateLimitState = {
        remaining: 60,
        reset: now + 60000,
        lastRequest: 0,
        limit: 60,
      };
      return;
    }

    // Wait if we're close to the rate limit
    if (rateLimitState.remaining <= 5) {
      const waitTime = rateLimitState.reset - now + 1000; // Add 1 second buffer
      if (waitTime > 0) {
        await this.delay(waitTime);
      }
    }

    // Add minimum delay between requests (optional)
    const minDelay = 1000 / (this.config.rateLimit.requestsPerMinute / 60);
    const timeSinceLastRequest = now - rateLimitState.lastRequest;
    if (timeSinceLastRequest < minDelay) {
      await this.delay(minDelay - timeSinceLastRequest);
    }
  }

  private resetQuotaWindows(): void {
    const now = Date.now();
    quotaState.minute.resetAt = now + 60 * 1000;
    quotaState.minute.count = 0;
    quotaState.hour.resetAt = now + 60 * 60 * 1000;
    quotaState.hour.count = 0;
  }

  private async enforceLocalQuota(): Promise<void> {
    while (true) {
      const now = Date.now();

      if (now >= quotaState.minute.resetAt) {
        quotaState.minute.resetAt = now + 60 * 1000;
        quotaState.minute.count = 0;
      }

      if (now >= quotaState.hour.resetAt) {
        quotaState.hour.resetAt = now + 60 * 60 * 1000;
        quotaState.hour.count = 0;
      }

      const minuteLimitReached = quotaState.minute.count >= this.config.rateLimit.requestsPerMinute;
      const hourLimitReached = quotaState.hour.count >= this.config.rateLimit.requestsPerHour;

      if (!minuteLimitReached && !hourLimitReached) {
        return;
      }

      const waitUntil = Math.min(
        minuteLimitReached ? quotaState.minute.resetAt : Number.POSITIVE_INFINITY,
        hourLimitReached ? quotaState.hour.resetAt : Number.POSITIVE_INFINITY
      );

      const waitTime = Math.max(waitUntil - now, 0) + 50;
      await this.delay(waitTime);
    }
  }

  private async acquireConcurrencySlot(): Promise<void> {
    if (concurrencyState.active < concurrencyState.max) {
      concurrencyState.active++;
      return;
    }

    await new Promise<void>(resolve => {
      concurrencyState.queue.push(() => {
        concurrencyState.active++;
        resolve();
      });
    });
  }

  private releaseConcurrencySlot(): void {
    if (concurrencyState.active > 0) {
      concurrencyState.active--;
    }

    const next = concurrencyState.queue.shift();
    if (next) {
      next();
    }
  }

  /**
   * Create a properly formatted API error
   */
  private createAPIError(status: number, errorData: any): Error {
    const error: APIError = {
      message: errorData.message || 'Unknown API error',
      code: errorData.code || 'UNKNOWN_ERROR',
      status,
      docs: errorData.docs || 'https://openphone.com/docs',
      title: errorData.title || 'API Error',
      trace: errorData.trace || '',
      errors: errorData.errors || [],
    };

    const errorMessage = `${error.title} (${error.code}): ${error.message}`;
    const apiError = new Error(errorMessage) as Error & APIError;
    Object.assign(apiError, error);
    
    return apiError;
  }

  /**
   * Utility function for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getRetryPolicy(): { attempts: number; delay: number } {
    return {
      attempts: this.config.sync.retryAttempts,
      delay: this.config.sync.retryDelay,
    };
  }

  /**
   * Get all contacts from OpenPhone
   */
  async getContacts(page: number = 1, limit: number = 100): Promise<{
    data: OpenPhoneContact[];
    hasMore: boolean;
    total: number;
  }> {
    const response = await this.makeRequest<{
      data: OpenPhoneContact[];
      hasMore: boolean;
      total: number;
    }>(`/contacts?page=${page}&limit=${limit}`);

    return {
      data: response.data || [],
      hasMore: response.hasMore || false,
      total: response.total || 0,
    };
  }

  /**
   * Get a specific contact by ID
   */
  async getContact(contactId: string): Promise<OpenPhoneContact> {
    const response = await this.makeRequest<OpenPhoneContactResponse>(`/contacts/${contactId}`);
    return response.data;
  }

  /**
   * Get contact by external ID (for duplicate detection)
   */
  async getContactByExternalId(externalId: string): Promise<OpenPhoneContact | null> {
    try {
      const response = await this.makeRequest<{
        data: OpenPhoneContact[];
      }>(`/contacts?externalId=${encodeURIComponent(externalId)}`);

      const matchingContact = response.data?.find(
        contact => contact.externalId === externalId
      );

      if (!matchingContact && response.data && response.data.length > 0) {
        console.warn(
          `External ID lookup returned non-matching contact(s). Requested="${externalId}", received=${response.data
            .map(contact => contact.externalId || 'undefined')
            .join(', ')}`
        );
      }

      return matchingContact || null;
    } catch (error) {
      // If contact not found, return null
      if (error instanceof Error && 'status' in error && (error as any).status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new contact
   */
  async createContact(contactData: ContactCreationRequest): Promise<OpenPhoneContact> {
    const response = await this.makeRequest<OpenPhoneContactResponse>('/contacts', 'POST', contactData);
    return response.data;
  }

  /**
   * Update an existing contact
   */
  async updateContact(contactId: string, contactData: ContactUpdateRequest): Promise<OpenPhoneContact> {
    const response = await this.makeRequest<OpenPhoneContactResponse>(`/contacts/${contactId}`, 'PATCH', contactData);
    return response.data;
  }

  /**
   * Delete a contact
   */
  async deleteContact(contactId: string): Promise<void> {
    await this.makeRequest(`/contacts/${contactId}`, 'DELETE');
  }

  /**
   * List calls with pagination
   */
  async listCalls(params: ListCallsParams): Promise<{ data: any[]; nextPageToken?: string | null }> {
    if (!params.phoneNumberId) {
      throw new Error('phoneNumberId is required when listing calls');
    }
    if (!params.participants || params.participants.length === 0) {
      throw new Error('At least one participant is required when listing calls');
    }

    const query = new URLSearchParams();
    query.set('phoneNumberId', params.phoneNumberId);
    for (const participant of params.participants) {
      query.append('participants', participant);
    }
    if (params.createdAfter) query.set('createdAfter', params.createdAfter);
    if (params.createdBefore) query.set('createdBefore', params.createdBefore);
    if (params.maxResults) query.set('maxResults', params.maxResults.toString());
    if (params.pageToken) query.set('pageToken', params.pageToken);

    const endpoint = `/calls${query.toString() ? `?${query.toString()}` : ''}`;
    const response = await this.makeRequest<{
      data: any[];
      nextPageToken?: string | null;
      meta?: { nextPageToken?: string | null };
    }>(endpoint);
    return {
      data: response.data || [],
      nextPageToken: response.nextPageToken ?? response.meta?.nextPageToken ?? null,
    };
  }

  /**
   * Retrieve a single call by ID
   */
  async getCall(callId: string): Promise<any> {
    if (!callId) {
      throw new Error('callId is required when fetching a call');
    }
    return this.makeRequest<{ data?: any }>(`/calls/${callId}`);
  }

  /**
   * List conversations with pagination
   */
  async listConversations(
    params: ListConversationsParams
  ): Promise<{ data: any[]; nextPageToken?: string | null }> {
    if (!params.phoneNumbers || params.phoneNumbers.length === 0) {
      throw new Error('At least one phone number is required when listing conversations');
    }

    const query = new URLSearchParams();
    for (const phone of params.phoneNumbers) {
      query.append('phoneNumbers', phone);
    }
    if (params.updatedAfter) query.set('updatedAfter', params.updatedAfter);
    if (params.updatedBefore) query.set('updatedBefore', params.updatedBefore);
    if (params.createdAfter) query.set('createdAfter', params.createdAfter);
    if (params.createdBefore) query.set('createdBefore', params.createdBefore);
    if (typeof params.excludeInactive === 'boolean') {
      query.set('excludeInactive', String(params.excludeInactive));
    }
    if (params.maxResults) query.set('maxResults', params.maxResults.toString());
    if (params.pageToken) query.set('pageToken', params.pageToken);

    const endpoint = `/conversations${query.toString() ? `?${query.toString()}` : ''}`;
    const response = await this.makeRequest<{
      data: any[];
      nextPageToken?: string | null;
      meta?: { nextPageToken?: string | null };
    }>(endpoint);
    return {
      data: response.data || [],
      nextPageToken: response.nextPageToken ?? response.meta?.nextPageToken ?? null,
    };
  }

  /**
   * List workspace phone numbers
   */
  async listPhoneNumbers(): Promise<{ data: any[] }> {
    const response = await this.makeRequest<{ data: any[] }>('/phone-numbers');
    return { data: response.data || [] };
  }

  /**
   * Batch create contacts (for performance)
   */
  async batchCreateContacts(contacts: ContactCreationRequest[]): Promise<OpenPhoneContact[]> {
    const results: OpenPhoneContact[] = [];
    const batchSize = this.config.sync.batchSize;

    // Process in batches to avoid overwhelming the API
    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);
      const batchPromises = batch.map(contact => this.createContact(contact));
      
      try {
        const batchResults = await Promise.allSettled(batchPromises);
        
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            // Log error but continue with other contacts
            console.error('Failed to create contact:', result.reason);
          }
        }
      } catch (error) {
        console.error('Batch creation error:', error);
      }

      // Small delay between batches
      if (i + batchSize < contacts.length) {
        await this.delay(1000);
      }
    }

    return results;
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): RateLimitInfo {
    return { ...rateLimitState, limit: rateLimitState.limit };
  }

  /**
   * Validate API key and connection
   */
  async validateConnection(): Promise<boolean> {
    try {
      await this.makeRequest('/contacts?limit=1');
      return true;
    } catch (error) {
      console.error('API validation failed:', error);
      return false;
    }
  }

  /**
   * Search contacts by name or phone number
   */
  async searchContacts(query: string, limit: number = 20): Promise<OpenPhoneContact[]> {
    try {
      const response = await this.makeRequest<{
        data: OpenPhoneContact[];
      }>(`/contacts?search=${encodeURIComponent(query)}&limit=${limit}`);

      return response.data || [];
    } catch (error) {
      // If search endpoint doesn't exist, fall back to getting all contacts and filtering
      if (error instanceof Error && 'status' in error && (error as any).status === 404) {
        const allContacts = await this.getContacts(1, 100);
        return allContacts.data.filter(contact => 
          contact.defaultFields.firstName?.toLowerCase().includes(query.toLowerCase()) ||
          contact.defaultFields.phoneNumbers?.some((phone: any) =>
            phone.value.includes(query.replace(/\D/g, ''))
          )
        );
      }
      throw error;
    }
  }
}

// Export a singleton instance
let apiClient: OpenPhoneAPIClient | null = null;

export function getOpenPhoneClient(): OpenPhoneAPIClient {
  if (!apiClient) {
    apiClient = new OpenPhoneAPIClient();
  }
  return apiClient;
}

// Export the class for testing
// Class already exported above
