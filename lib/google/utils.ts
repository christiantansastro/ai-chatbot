import { googleAuth } from './auth';

/**
 * Utility functions for Google Calendar and Tasks integration
 */

/**
 * Converts a date string or Date object to ISO format for Google APIs
 */
export function formatDateForGoogle(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    throw new Error('Invalid date provided');
  }

  return dateObj.toISOString();
}

/**
 * Converts Google API datetime to JavaScript Date object
 */
export function parseGoogleDateTime(dateTime: string | undefined): Date | null {
  if (!dateTime) return null;

  const date = new Date(dateTime);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Formats a date for display in a user-friendly format
 */
export function formatDateForDisplay(date: string | Date | null): string {
  if (!date) return 'Not specified';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    return 'Invalid date';
  }

  return dateObj.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

/**
 * Creates a date with time set to start of day
 */
export function startOfDay(date: string | Date): Date {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const start = new Date(dateObj);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Creates a date with time set to end of day
 */
export function endOfDay(date: string | Date): Date {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const end = new Date(dateObj);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Validates if a string is a valid email address
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitizes text input to prevent injection attacks
 */
export function sanitizeText(text: string): string {
  if (typeof text !== 'string') {
    return '';
  }

  return text
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .slice(0, 1000); // Limit length
}

/**
 * Validates calendar event data
 */
export function validateCalendarEvent(event: {
  summary?: string;
  description?: string;
  start?: string | Date;
  end?: string | Date;
  attendees?: string[];
}): void {
  if (!event.summary || event.summary.trim().length === 0) {
    throw new Error('Event summary is required');
  }

  if (!event.start) {
    throw new Error('Event start time is required');
  }

  if (!event.end) {
    throw new Error('Event end time is required');
  }

  const startDate = new Date(event.start);
  const endDate = new Date(event.end);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new Error('Invalid start or end date');
  }

  if (endDate <= startDate) {
    throw new Error('End time must be after start time');
  }

  // Validate attendees emails if provided
  if (event.attendees && event.attendees.length > 0) {
    for (const email of event.attendees) {
      if (!isValidEmail(email)) {
        throw new Error(`Invalid email address: ${email}`);
      }
    }
  }
}

/**
 * Validates task data
 */
export function validateTask(task: {
  title?: string;
  notes?: string;
  due?: string | Date;
}): void {
  if (!task.title || task.title.trim().length === 0) {
    throw new Error('Task title is required');
  }

  if (task.due) {
    const dueDate = new Date(task.due);
    if (isNaN(dueDate.getTime())) {
      throw new Error('Invalid due date');
    }
  }
}

/**
 * Rate limiting utility for Google API calls
 */
class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly timeWindow: number; // in milliseconds

  constructor(maxRequests: number = 100, timeWindow: number = 60000) { // 100 requests per minute default
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow;
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now();

    // Remove old requests outside the time window
    this.requests = this.requests.filter(time => now - time < this.timeWindow);

    if (this.requests.length >= this.maxRequests) {
      // Calculate how long to wait for the oldest request to expire
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.timeWindow - (now - oldestRequest) + 100; // Add 100ms buffer

      console.log(`⏳ Rate limiting: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.requests.push(now);
  }
}

// Export rate limiter instance
export const googleRateLimiter = new RateLimiter();

/**
 * Retry utility for API calls
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on certain errors
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('invalid') ||
            errorMessage.includes('not found') ||
            errorMessage.includes('forbidden') ||
            errorMessage.includes('unauthorized')) {
          throw error;
        }
      }

      if (attempt === maxRetries) {
        throw error;
      }

      console.warn(`⚠️ Attempt ${attempt} failed, retrying in ${delay}ms:`, error);
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }

  throw lastError!;
}

/**
 * Logs Google API operations for debugging
 */
export function logGoogleOperation(
  operation: string,
  resource: string,
  details?: any
): void {
  console.log(`🔄 Google ${resource} ${operation}:`, details || '');
}

/**
 * Handles Google API errors consistently
 */
export function handleGoogleApiError(error: any, operation: string): never {
  console.error(`❌ Google API ${operation} failed:`, error);

  let userMessage = `Failed to ${operation}`;

  if (error?.code === 403) {
    userMessage = 'Permission denied. Please check Google API credentials and permissions.';
  } else if (error?.code === 404) {
    userMessage = 'Resource not found. Please verify the calendar or task exists.';
  } else if (error?.code === 429) {
    userMessage = 'Rate limit exceeded. Please try again later.';
  } else if (error?.code >= 500) {
    userMessage = 'Google service temporarily unavailable. Please try again later.';
  }

  throw new Error(`${userMessage} (Error code: ${error?.code || 'unknown'})`);
}