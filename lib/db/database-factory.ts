import type { DatabaseConfig, SupabaseConfig } from './adapters/types';
import { DatabaseAdapterFactory } from './adapters/base.adapter';
import { SchemaManager } from './schema-manager';

// Dynamic import for PostgreSQL adapter to avoid client-side bundling
const loadPostgreSQLAdapter = async () => {
  if (typeof window === 'undefined') {
    const { PostgreSQLAdapter } = await import('./adapters/postgresql.adapter');
    return PostgreSQLAdapter;
  }
  return null;
};

// Database factory class that provides a unified interface
export class DatabaseFactory {
  private static instance: DatabaseFactory;
  private adapter: any;
  private schemaManager: SchemaManager;
  private config: DatabaseConfig | null = null;

  private constructor() {
    this.schemaManager = new SchemaManager();
  }

  static getInstance(): DatabaseFactory {
    if (!DatabaseFactory.instance) {
      DatabaseFactory.instance = new DatabaseFactory();
    }
    return DatabaseFactory.instance;
  }

  // Initialize the database with configuration
  async initialize(config: DatabaseConfig): Promise<void> {
    this.config = config;

    // Create the appropriate adapter based on configuration
    this.adapter = await DatabaseAdapterFactory.createAdapter(
      config.type,
      config
    );

    // Connect to the database
    await this.adapter.connect(config);

    console.log(`Database initialized with ${config.type} adapter`);
  }

  // Get the current adapter
  getAdapter(): any {
    if (!this.adapter) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.adapter;
  }

  // Get the schema manager
  getSchemaManager(): SchemaManager {
    return this.schemaManager;
  }

  // Get current configuration
  getConfig(): DatabaseConfig | null {
    return this.config;
  }

  // Check if database is connected
  isConnected(): boolean {
    return this.adapter?.isConnected() || false;
  }

  // Disconnect from database
  async disconnect(): Promise<void> {
    if (this.adapter) {
      await this.adapter.disconnect();
    }
  }
}

// Environment-based configuration loader
export class DatabaseConfigLoader {
  static loadFromEnvironment(): DatabaseConfig {
    const databaseType = (process.env.DATABASE_TYPE as 'postgresql' | 'supabase') || 'supabase';
    const clientId = process.env.CLIENT_ID || 'default';

    if (databaseType === 'supabase') {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        throw new Error('Missing Supabase configuration. Please check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.');
      }

      return {
        type: 'supabase',
        url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        clientId
      } as SupabaseConfig;
    } else if (databaseType === 'postgresql') {
      if (!process.env.POSTGRES_URL) {
        throw new Error('Missing PostgreSQL configuration. Please check POSTGRES_URL environment variable.');
      }

      return {
        type: 'postgresql',
        connectionString: process.env.POSTGRES_URL,
        clientId
      };
    } else {
      throw new Error(`Unsupported database type: ${databaseType}`);
    }
  }

  static loadFromConfig(config: Partial<DatabaseConfig & SupabaseConfig>): DatabaseConfig {
    const databaseType = config.type || 'supabase';

    if (databaseType === 'supabase') {
      return {
        type: 'supabase',
        url: config.url || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        key: config.key || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        serviceRoleKey: (config as any).serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY,
        clientId: config.clientId || process.env.CLIENT_ID || 'default'
      } as SupabaseConfig;
    } else {
      return {
        type: 'postgresql',
        connectionString: config.connectionString || process.env.POSTGRES_URL || '',
        clientId: config.clientId || process.env.CLIENT_ID || 'default'
      };
    }
  }
}

// Database service class that provides high-level operations
export class DatabaseService {
  private factory: DatabaseFactory;
  private adapter: any;
  private schemaManager: SchemaManager;
  private initialized = false;

  constructor() {
    this.factory = DatabaseFactory.getInstance();
    this.schemaManager = this.factory.getSchemaManager();
    // Don't initialize adapter here - do it lazily
  }

  // Initialize database service
  async initialize(config?: DatabaseConfig): Promise<void> {
    if (config) {
      await this.factory.initialize(config);
    } else {
      const envConfig = DatabaseConfigLoader.loadFromEnvironment();
      await this.factory.initialize(envConfig);
    }

    this.adapter = this.factory.getAdapter();
    this.initialized = true;
  }

  // Get adapter with lazy initialization
  private async getAdapter(): Promise<any> {
    if (!this.initialized) {
      console.log('🔄 Auto-initializing database service...');
      await this.initialize();
    }
    return this.adapter;
  }

  // User operations
  async getUser(email: string) {
    const adapter = await this.getAdapter();
    return adapter.getUser(email);
  }

  async createUser(userData: any) {
    // Validate against schema if needed
    const clientId = this.factory.getConfig()?.clientId || 'default';
    const validation = this.schemaManager.validateData(userData, clientId, 'users');

    if (!validation.isValid) {
      throw new Error(`User data validation failed: ${validation.errors.join(', ')}`);
    }

    const adapter = await this.getAdapter();
    return adapter.createUser(userData);
  }

  async createGuestUser() {
    const adapter = await this.getAdapter();
    return adapter.createGuestUser();
  }

  // Chat operations
  async saveChat(chatData: any) {
    const clientId = this.factory.getConfig()?.clientId || 'default';
    const adaptedData = this.schemaManager.adaptChatData(chatData, clientId);
    const adapter = await this.getAdapter();
    return adapter.saveChat(adaptedData);
  }

  async getChatById(id: string) {
    const adapter = await this.getAdapter();
    return adapter.getChatById(id);
  }

  async getChatsByUserId(userId: string, options?: any) {
    const adapter = await this.getAdapter();
    return adapter.getChatsByUserId(userId, options);
  }

  async deleteChatById(id: string) {
    const adapter = await this.getAdapter();
    return adapter.deleteChatById(id);
  }

  async updateChatVisibility(chatId: string, visibility: 'public' | 'private') {
    const adapter = await this.getAdapter();
    return adapter.updateChatVisibility(chatId, visibility);
  }

  async updateChatLastContext(chatId: string, context: any) {
    const adapter = await this.getAdapter();
    return adapter.updateChatLastContext(chatId, context);
  }

  // Message operations
  async saveMessages(messages: any[]) {
    const clientId = this.factory.getConfig()?.clientId || 'default';
    const adaptedMessages = messages.map(msg =>
      this.schemaManager.adaptMessageData(msg, clientId)
    );
    const adapter = await this.getAdapter();
    return adapter.saveMessages(adaptedMessages);
  }

  async getMessagesByChatId(chatId: string, options?: any) {
    const adapter = await this.getAdapter();
    return adapter.getMessagesByChatId(chatId, options);
  }

  async getMessageById(id: string) {
    const adapter = await this.getAdapter();
    return adapter.getMessageById(id);
  }

  async deleteMessagesByChatIdAfterTimestamp(chatId: string, timestamp: Date) {
    const adapter = await this.getAdapter();
    return adapter.deleteMessagesByChatIdAfterTimestamp(chatId, timestamp);
  }

  // Vote operations
  async voteMessage(voteData: any) {
    const adapter = await this.getAdapter();
    return adapter.voteMessage(voteData);
  }

  async getVotesByChatId(chatId: string) {
    const adapter = await this.getAdapter();
    return adapter.getVotesByChatId(chatId);
  }

  // Document operations
  async saveDocument(documentData: any) {
    const adapter = await this.getAdapter();
    return adapter.saveDocument(documentData);
  }

  async getDocumentsById(id: string) {
    const adapter = await this.getAdapter();
    return adapter.getDocumentsById(id);
  }

  async getDocumentById(id: string) {
    const adapter = await this.getAdapter();
    return adapter.getDocumentById(id);
  }

  async deleteDocumentsByIdAfterTimestamp(id: string, timestamp: Date) {
    const adapter = await this.getAdapter();
    return adapter.deleteDocumentsByIdAfterTimestamp(id, timestamp);
  }

  // Suggestion operations
  async saveSuggestions(suggestions: any[]) {
    const adapter = await this.getAdapter();
    return adapter.saveSuggestions(suggestions);
  }

  async getSuggestionsByDocumentId(documentId: string) {
    const adapter = await this.getAdapter();
    return adapter.getSuggestionsByDocumentId(documentId);
  }

  // File operations
  async createFileRecord(fileData: any) {
    const adapter = await this.getAdapter();
    return adapter.createFileRecord(fileData);
  }

  async getFilesByClientId(clientId: string) {
    const adapter = await this.getAdapter();
    return adapter.getFilesByClientId(clientId);
  }

  async getFilesByTempQueueId(tempQueueId: string) {
    const adapter = await this.getAdapter();
    return adapter.getFilesByTempQueueId(tempQueueId);
  }

  async updateFileStatus(fileId: string, status: 'assigned' | 'temp_queue' | 'error', clientName?: string) {
    const adapter = await this.getAdapter();
    return adapter.updateFileStatus(fileId, status, clientName);
  }

  async deleteFileRecord(fileId: string) {
    const adapter = await this.getAdapter();
    return adapter.deleteFileRecord(fileId);
  }

  async createTempQueue() {
    const adapter = await this.getAdapter();
    return adapter.createTempQueue();
  }

  // Utility operations
  async getMessageCountByUserId(userId: string, hours: number) {
    const adapter = await this.getAdapter();
    return adapter.getMessageCountByUserId(userId, hours);
  }

  async createStreamId(streamId: string, chatId: string) {
    const adapter = await this.getAdapter();
    return adapter.createStreamId(streamId, chatId);
  }

  async getStreamIdsByChatId(chatId: string) {
    const adapter = await this.getAdapter();
    return adapter.getStreamIdsByChatId(chatId);
  }

  // Schema operations
  getSchemaManager() {
    return this.schemaManager;
  }

  getCurrentClientId(): string {
    return this.factory.getConfig()?.clientId || 'default';
  }

  // Health check
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    try {
      const isConnected = this.factory.isConnected();

      if (!isConnected) {
        return {
          status: 'unhealthy',
          details: { error: 'Database not connected' }
        };
      }

      // Simple connection test - just check if we can access the adapter
      const adapter = await this.getAdapter();

      return {
        status: 'healthy',
        details: {
          adapter: this.factory.getConfig()?.type,
          message: 'Database connection successful'
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        status: 'unhealthy',
        details: { error: errorMessage }
      };
    }
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();
export const databaseFactory = DatabaseFactory.getInstance();