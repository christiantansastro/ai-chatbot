import type {
  DatabaseConfig,
  UserData,
  ChatData,
  MessageData,
  VoteData,
  DocumentData,
  SuggestionData,
  QueryOptions,
  SchemaValidationResult
} from './types';

// Base database adapter interface
export interface DatabaseAdapter {
  // Connection management
  connect(config: DatabaseConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // User operations
  getUser(email: string): Promise<UserData[]>;
  createUser(userData: UserData): Promise<UserData>;
  createGuestUser(): Promise<UserData>;

  // Chat operations
  saveChat(chatData: ChatData): Promise<ChatData>;
  getChatById(id: string): Promise<ChatData | null>;
  getChatsByUserId(userId: string, options?: QueryOptions): Promise<{
    chats: ChatData[];
    hasMore: boolean;
  }>;
  deleteChatById(id: string): Promise<ChatData>;
  updateChatVisibility(chatId: string, visibility: 'public' | 'private'): Promise<void>;
  updateChatLastContext(chatId: string, context: any): Promise<void>;

  // Message operations
  saveMessages(messages: MessageData[]): Promise<void>;
  getMessagesByChatId(chatId: string, options?: QueryOptions): Promise<MessageData[]>;
  getMessageById(id: string): Promise<MessageData[]>;
  deleteMessagesByChatIdAfterTimestamp(chatId: string, timestamp: Date): Promise<void>;

  // Vote operations
  voteMessage(voteData: VoteData): Promise<void>;
  getVotesByChatId(chatId: string): Promise<VoteData[]>;

  // Document operations
  saveDocument(documentData: DocumentData): Promise<DocumentData>;
  getDocumentsById(id: string): Promise<DocumentData[]>;
  getDocumentById(id: string): Promise<DocumentData | null>;
  deleteDocumentsByIdAfterTimestamp(id: string, timestamp: Date): Promise<DocumentData[]>;

  // Suggestion operations
  saveSuggestions(suggestions: SuggestionData[]): Promise<void>;
  getSuggestionsByDocumentId(documentId: string): Promise<SuggestionData[]>;

  // Utility operations
  getMessageCountByUserId(userId: string, hours: number): Promise<number>;
  createStreamId(streamId: string, chatId: string): Promise<void>;
  getStreamIdsByChatId(chatId: string): Promise<string[]>;

  // Schema management
  getSchemaVersion(clientId: string): Promise<string>;
  migrateSchema(clientId: string, targetVersion: string): Promise<void>;
  validateSchema(clientId: string): Promise<SchemaValidationResult>;

  // Transaction support
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
}

// Factory function to create database adapters
export class DatabaseAdapterFactory {
  static async createAdapter(type: 'postgresql' | 'supabase', config: DatabaseConfig): Promise<DatabaseAdapter> {
    switch (type) {
      case 'supabase': {
        const SupabaseAdapter = await loadSupabaseAdapter();
        if (!SupabaseAdapter) {
          throw new Error('SupabaseAdapter not available in browser environment');
        }
        return new SupabaseAdapter(config as any);
      }
      case 'postgresql': {
        const PostgreSQLAdapter = await loadPostgreSQLAdapter();
        if (!PostgreSQLAdapter) {
          throw new Error('PostgreSQLAdapter not available in browser environment');
        }
        return new PostgreSQLAdapter(config);
      }
      default:
        throw new Error(`Unsupported database type: ${type}`);
    }
  }
}

// Dynamic imports to avoid client-side bundling
let SupabaseAdapter: any = null;
let PostgreSQLAdapter: any = null;

const loadSupabaseAdapter = async () => {
  if (typeof window === 'undefined' && !SupabaseAdapter) {
    const module = await import('./supabase.adapter');
    SupabaseAdapter = module.SupabaseAdapter;
  }
  return SupabaseAdapter;
};

const loadPostgreSQLAdapter = async () => {
  if (typeof window === 'undefined' && !PostgreSQLAdapter) {
    const module = await import('./postgresql.adapter');
    PostgreSQLAdapter = module.PostgreSQLAdapter;
  }
  return PostgreSQLAdapter;
};