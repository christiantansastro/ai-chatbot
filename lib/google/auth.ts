import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

// Google Service Account credentials interface
interface GoogleCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
  universe_domain: string;
}

// Environment variables validation
const requiredEnvVars = [
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
  'GOOGLE_CALENDAR_ID',
  'GOOGLE_TASKS_LIST_ID'
];

/**
 * Validates that all required Google API environment variables are present
 */
function validateEnvironmentVariables(): void {
  const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required Google API environment variables: ${missing.join(', ')}. ` +
      'Please check your .env.local file.'
    );
  }
}

/**
 * Creates and returns authenticated Google API clients
 */
export class GoogleAuthService {
  private static instance: GoogleAuthService;
  private jwtClient: JWT | null = null;
  private calendarClient: any = null;
  private tasksClient: any = null;
  private initialized: boolean = false;

  private constructor() {
    // Don't initialize immediately, wait for explicit initialization
  }

  /**
   * Gets the singleton instance of GoogleAuthService
   */
  public static getInstance(): GoogleAuthService {
    if (!GoogleAuthService.instance) {
      GoogleAuthService.instance = new GoogleAuthService();
    }
    return GoogleAuthService.instance;
  }

  /**
   * Initialize the authentication service
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initializeAuth();
    this.initialized = true;
  }

  /**
   * Initializes Google authentication with service account
   */
  private initializeAuth(): void {
    try {
      validateEnvironmentVariables();

      const credentials: GoogleCredentials = {
        type: 'service_account',
        project_id: process.env.GOOGLE_PROJECT_ID || 'ai-chabot-475004',
        private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID || '636efbe4804a7f434dbd7acfec8fcc931d087221',
        private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n'),
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
        client_id: process.env.GOOGLE_CLIENT_ID || '113460588274612133179',
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!)}`,
        universe_domain: 'googleapis.com'
      };

      // Create JWT client for service account authentication
      this.jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: [
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/calendar.events',
          'https://www.googleapis.com/auth/tasks',
          'https://www.googleapis.com/auth/tasks.readonly'
        ]
      });

      // Initialize API clients
      this.calendarClient = google.calendar({ version: 'v3', auth: this.jwtClient });
      this.tasksClient = google.tasks({ version: 'v1', auth: this.jwtClient });

      console.log('✅ Google Auth Service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Google Auth Service:', error);
      throw error;
    }
  }

  /**
   * Gets the authenticated Calendar API client
   */
  public getCalendarClient() {
    if (!this.calendarClient) {
      throw new Error('Calendar client not initialized. Call initializeAuth() first.');
    }
    return this.calendarClient;
  }

  /**
   * Gets the authenticated Tasks API client
   */
  public getTasksClient() {
    if (!this.tasksClient) {
      throw new Error('Tasks client not initialized. Call initializeAuth() first.');
    }
    return this.tasksClient;
  }

  /**
   * Gets the default calendar ID from environment
   */
  public getDefaultCalendarId(): string {
    return process.env.GOOGLE_CALENDAR_ID || 'primary';
  }

  /**
   * Gets the default task list ID from environment
   */
  public getDefaultTaskListId(): string {
    return process.env.GOOGLE_TASKS_LIST_ID || '@default';
  }

  /**
   * Tests the authentication by making a simple API call
   */
  public async testConnection(): Promise<boolean> {
    try {
      const calendar = this.getCalendarClient();

      // Try to get calendar list to test authentication
      await calendar.calendarList.list({
        maxResults: 1
      });

      console.log('✅ Google API authentication test successful');
      return true;
    } catch (error) {
      console.error('❌ Google API authentication test failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const googleAuth = GoogleAuthService.getInstance();