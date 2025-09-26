import type { User, Chat, DBMessage, Vote, Document, Suggestion } from '../schema';

// Database configuration types
export interface DatabaseConfig {
  type: 'postgresql' | 'supabase';
  connectionString?: string;
  url?: string;
  key?: string;
  clientId?: string;
}

export interface SupabaseConfig extends DatabaseConfig {
  type: 'supabase';
  url: string;
  key: string;
  serviceRoleKey?: string;
  clientId: string;
}

// Core data types for database operations
export interface UserData {
  id?: string;
  email: string;
  password?: string;
  type?: 'guest' | 'regular';
}

export interface ChatData {
  id: string;
  userId: string;
  title: string;
  visibility: 'public' | 'private';
  lastContext?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MessageData {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'system';
  parts: any[];
  attachments: any[];
  createdAt: Date;
}

export interface VoteData {
  chatId: string;
  messageId: string;
  isUpvoted: boolean;
}

export interface DocumentData {
  id: string;
  title: string;
  content?: string;
  kind: 'text' | 'code' | 'image' | 'sheet';
  userId: string;
  createdAt: Date;
}

export interface SuggestionData {
  id: string;
  documentId: string;
  documentCreatedAt: Date;
  originalText: string;
  suggestedText: string;
  description?: string;
  isResolved: boolean;
  userId: string;
  createdAt: Date;
}

// Schema management types
export interface SchemaDefinition {
  clientId: string;
  version: string;
  tables: {
    [tableName: string]: {
      fields: { [fieldName: string]: FieldDefinition };
      indexes?: string[];
      constraints?: string[];
    };
  };
}

export interface FieldDefinition {
  type: string;
  required: boolean;
  defaultValue?: any;
  encrypted?: boolean;
}

export interface SchemaValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Query options
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  cache?: boolean;
  cacheTtl?: number;
}

// Error types
export class DatabaseError extends Error {
  constructor(message: string, public cause?: any) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class SchemaError extends Error {
  constructor(message: string, public schemaVersion?: string) {
    super(message);
    this.name = 'SchemaError';
  }
}