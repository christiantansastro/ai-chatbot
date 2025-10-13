import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

// OAuth credentials interface
interface OAuthCredentials {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

// Environment variables validation for OAuth
const requiredEnvVars = [
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_CALENDAR_ID',
  'GOOGLE_TASKS_LIST_ID'
];

/**
 * Validates that all required OAuth environment variables are present
 */
function validateEnvironmentVariables(): void {
  const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required Google OAuth environment variables: ${missing.join(', ')}. ` +
      'Please check your .env.local file.'
    );
  }
}

/**
 * OAuth-based Google API authentication service
 */
export class GoogleOAuthService {
  private static instance: GoogleOAuthService;
  private oauth2Client: OAuth2Client | null = null;
  private calendarClient: any = null;
  private tasksClient: any = null;
  private initialized: boolean = false;

  private constructor() {
    // Don't initialize immediately, wait for explicit initialization with tokens
  }

  /**
   * Gets the singleton instance of GoogleOAuthService
   */
  public static getInstance(): GoogleOAuthService {
    if (!GoogleOAuthService.instance) {
      GoogleOAuthService.instance = new GoogleOAuthService();
    }
    return GoogleOAuthService.instance;
  }

  /**
   * Initialize the OAuth service with access tokens
   */
  public async initialize(accessToken?: string, refreshToken?: string): Promise<void> {
    if (this.initialized && this.oauth2Client) {
      return;
    }

    // If no tokens provided, try to get from environment
    if (!accessToken) {
      const envAccessToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
      const envRefreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

      if (envAccessToken) {
        this.initializeAuth(envAccessToken, envRefreshToken);
        this.initialized = true;
        return;
      } else {
        throw new Error('No access token provided and GOOGLE_OAUTH_ACCESS_TOKEN not found in environment');
      }
    }

    this.initializeAuth(accessToken, refreshToken);
    this.initialized = true;
  }

  /**
   * Initialize OAuth authentication
   */
  private initializeAuth(accessToken: string, refreshToken?: string): void {
    try {
      validateEnvironmentVariables();

      // Create OAuth2 client
      this.oauth2Client = new OAuth2Client(
        process.env.GOOGLE_OAUTH_CLIENT_ID!,
        process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
        process.env.GOOGLE_OAUTH_REDIRECT_URI || 'https://ai-chatbot-sepia-ten.vercel.app/auth/google/callback'
      );

      // Set credentials
      this.oauth2Client.setCredentials({
        access_token: accessToken,
        ...(refreshToken && { refresh_token: refreshToken }),
      });

      // Initialize API clients with OAuth authentication
      this.calendarClient = google.calendar({
        version: 'v3',
        auth: this.oauth2Client
      });
      this.tasksClient = google.tasks({
        version: 'v1',
        auth: this.oauth2Client
      });

      console.log('✅ Google OAuth Service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Google OAuth Service:', error);
      throw error;
    }
  }

  /**
   * Generate OAuth authorization URL
   */
  public getAuthUrl(): string {
    // Initialize OAuth client if not already done (for URL generation only)
    if (!this.oauth2Client) {
      this.initializeOAuthClient();
    }

    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/tasks',
      'https://www.googleapis.com/auth/tasks.readonly'
    ];

    return this.oauth2Client!.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
    });
  }

  /**
   * Initialize OAuth client for URL generation (without tokens)
   */
  private initializeOAuthClient(): void {
    try {
      validateEnvironmentVariables();

      // Create OAuth2 client for URL generation only
      this.oauth2Client = new OAuth2Client(
        process.env.GOOGLE_OAUTH_CLIENT_ID!,
        process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
        process.env.GOOGLE_OAUTH_REDIRECT_URI || 'https://ai-chatbot-sepia-ten.vercel.app/auth/google/callback'
      );

      console.log('✅ OAuth client initialized for URL generation');
    } catch (error) {
      console.error('❌ Failed to initialize OAuth client:', error);
      throw error;
    }
  }

  /**
   * Exchange authorization code for tokens
   */
  public async exchangeCodeForTokens(code: string): Promise<any> {
    if (!this.oauth2Client) {
      throw new Error('OAuth client not initialized');
    }

    try {
      const response = await this.oauth2Client.getToken(code);
      const tokens = response.tokens;

      this.oauth2Client.setCredentials(tokens);

      // Update API clients with new tokens
      this.calendarClient = google.calendar({ version: 'v3', auth: this.oauth2Client });
      this.tasksClient = google.tasks({ version: 'v1', auth: this.oauth2Client });

      console.log('✅ OAuth tokens exchanged successfully');
      return tokens;
    } catch (error) {
      console.error('❌ Failed to exchange code for tokens:', error);
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  public async refreshAccessToken(): Promise<string | null> {
    if (!this.oauth2Client) {
      throw new Error('OAuth client not initialized');
    }

    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      const newAccessToken = credentials.access_token;

      if (newAccessToken) {
        this.oauth2Client.setCredentials(credentials);
        // Update API clients with refreshed token
        this.calendarClient = google.calendar({ version: 'v3', auth: this.oauth2Client });
        this.tasksClient = google.tasks({ version: 'v1', auth: this.oauth2Client });

        console.log('✅ Access token refreshed successfully');
        return newAccessToken;
      }

      return null;
    } catch (error) {
      console.error('❌ Failed to refresh access token:', error);
      return null;
    }
  }

  /**
   * Gets the authenticated Calendar API client
   */
  public getCalendarClient() {
    if (!this.calendarClient) {
      throw new Error('Calendar client not initialized. Call initialize() first.');
    }
    return this.calendarClient;
  }

  /**
   * Gets the authenticated Tasks API client
   */
  public getTasksClient() {
    if (!this.tasksClient) {
      throw new Error('Tasks client not initialized. Call initialize() first.');
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

      console.log('✅ Google OAuth authentication test successful');
      return true;
    } catch (error) {
      console.error('❌ Google OAuth authentication test failed:', error);

      // If token expired, try to refresh
      if ((error as any)?.code === 401) {
        console.log('🔄 Attempting to refresh access token...');
        const newToken = await this.refreshAccessToken();
        if (newToken) {
          console.log('✅ Token refreshed, retrying test...');
          return await this.testConnection();
        }
      }

      return false;
    }
  }

  /**
   * Get current access token
   */
  public getAccessToken(): string | undefined {
    return this.oauth2Client?.credentials.access_token || undefined;
  }

  /**
   * Get current refresh token
   */
  public getRefreshToken(): string | undefined {
    return this.oauth2Client?.credentials.refresh_token || undefined;
  }
}

// Export singleton instance
export const googleOAuth = GoogleOAuthService.getInstance();