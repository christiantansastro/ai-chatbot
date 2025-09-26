import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
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
import type { DatabaseAdapter } from './base.adapter';

class DatabaseError extends Error {
  constructor(message: string, public cause?: any) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class PostgreSQLAdapter implements DatabaseAdapter {
  private db: any;
  private client: any;
  private isConnectedFlag = false;

  async connect(config: DatabaseConfig): Promise<void> {
    try {
      if (config.type !== 'postgresql' || !config.connectionString) {
        throw new Error('Invalid PostgreSQL configuration');
      }

      this.client = postgres(config.connectionString);
      this.db = drizzle(this.client);
      this.isConnectedFlag = true;

      // Test connection
      await this.client`SELECT 1`;
    } catch (error) {
      this.isConnectedFlag = false;
      throw new DatabaseError('Failed to connect to PostgreSQL', error);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end();
    }
    this.isConnectedFlag = false;
  }

  isConnected(): boolean {
    return this.isConnectedFlag;
  }

  // User operations
  async getUser(email: string): Promise<UserData[]> {
    try {
      const result = await this.db
        .select()
        .from(user)
        .where(eq(user.email, email));

      return result.map((u: any) => ({
        id: u.id,
        email: u.email,
        password: u.password,
        type: 'regular'
      }));
    } catch (error) {
      throw new DatabaseError('Failed to get user', error);
    }
  }

  async createUser(userData: UserData): Promise<UserData> {
    try {
      const result = await this.db
        .insert(user)
        .values({
          email: userData.email,
          password: userData.password
        })
        .returning();

      return {
        id: result[0].id,
        email: result[0].email,
        password: result[0].password,
        type: 'regular'
      };
    } catch (error) {
      throw new DatabaseError('Failed to create user', error);
    }
  }

  async createGuestUser(): Promise<UserData> {
    try {
      const email = `guest-${Date.now()}`;
      const result = await this.db
        .insert(user)
        .values({ email })
        .returning();

      return {
        id: result[0].id,
        email: result[0].email,
        type: 'guest'
      };
    } catch (error) {
      throw new DatabaseError('Failed to create guest user', error);
    }
  }

  // Chat operations
  async saveChat(chatData: ChatData): Promise<ChatData> {
    try {
      const result = await this.db
        .insert(chat)
        .values({
          id: chatData.id,
          userId: chatData.userId,
          title: chatData.title,
          visibility: chatData.visibility,
          lastContext: chatData.lastContext,
          createdAt: chatData.createdAt,
          updatedAt: chatData.updatedAt
        })
        .returning();

      return {
        id: result[0].id,
        userId: result[0].userId,
        title: result[0].title,
        visibility: result[0].visibility,
        lastContext: result[0].lastContext,
        createdAt: result[0].createdAt,
        updatedAt: result[0].updatedAt
      };
    } catch (error) {
      throw new DatabaseError('Failed to save chat', error);
    }
  }

  async getChatById(id: string): Promise<ChatData | null> {
    try {
      const result = await this.db
        .select()
        .from(chat)
        .where(eq(chat.id, id))
        .limit(1);

      if (result.length === 0) return null;

      const c = result[0];
      return {
        id: c.id,
        userId: c.userId,
        title: c.title,
        visibility: c.visibility,
        lastContext: c.lastContext,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      };
    } catch (error) {
      throw new DatabaseError('Failed to get chat by id', error);
    }
  }

  async getChatsByUserId(userId: string, options: QueryOptions = {}): Promise<{
    chats: ChatData[];
    hasMore: boolean;
  }> {
    try {
      let query = this.db
        .select()
        .from(chat)
        .where(eq(chat.userId, userId))
        .orderBy(desc(chat.createdAt));

      if (options.limit) {
        query = query.limit(options.limit + 1);
      }

      const result = await query;

      const chats = result.map((c: any) => ({
        id: c.id,
        userId: c.userId,
        title: c.title,
        visibility: c.visibility,
        lastContext: c.lastContext,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      }));

      const hasMore = options.limit ? chats.length > options.limit : false;
      const limitedChats = hasMore ? chats.slice(0, options.limit) : chats;

      return { chats: limitedChats, hasMore };
    } catch (error) {
      throw new DatabaseError('Failed to get chats by user id', error);
    }
  }

  async deleteChatById(id: string): Promise<ChatData> {
    try {
      // Delete related data first
      await this.db.delete(vote).where(eq(vote.chatId, id));
      await this.db.delete(message).where(eq(message.chatId, id));
      await this.db.delete(stream).where(eq(stream.chatId, id));

      const result = await this.db
        .delete(chat)
        .where(eq(chat.id, id))
        .returning();

      const c = result[0];
      return {
        id: c.id,
        userId: c.userId,
        title: c.title,
        visibility: c.visibility,
        lastContext: c.lastContext,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      };
    } catch (error) {
      throw new DatabaseError('Failed to delete chat by id', error);
    }
  }

  async updateChatVisibility(chatId: string, visibility: 'public' | 'private'): Promise<void> {
    try {
      await this.db
        .update(chat)
        .set({ visibility })
        .where(eq(chat.id, chatId));
    } catch (error) {
      throw new DatabaseError('Failed to update chat visibility', error);
    }
  }

  async updateChatLastContext(chatId: string, context: any): Promise<void> {
    try {
      await this.db
        .update(chat)
        .set({ lastContext: context })
        .where(eq(chat.id, chatId));
    } catch (error) {
      throw new DatabaseError('Failed to update chat last context', error);
    }
  }

  // Message operations
  async saveMessages(messages: MessageData[]): Promise<void> {
    try {
      const messagesToInsert = messages.map(msg => ({
        id: msg.id,
        chatId: msg.chatId,
        role: msg.role,
        parts: msg.parts,
        attachments: msg.attachments,
        createdAt: msg.createdAt
      }));

      await this.db.insert(message).values(messagesToInsert);
    } catch (error) {
      throw new DatabaseError('Failed to save messages', error);
    }
  }

  async getMessagesByChatId(chatId: string, options: QueryOptions = {}): Promise<MessageData[]> {
    try {
      let query = this.db
        .select()
        .from(message)
        .where(eq(message.chatId, chatId))
        .orderBy(asc(message.createdAt));

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const result = await query;

      return result.map((msg: any) => ({
        id: msg.id,
        chatId: msg.chatId,
        role: msg.role,
        parts: msg.parts,
        attachments: msg.attachments,
        createdAt: msg.createdAt
      }));
    } catch (error) {
      throw new DatabaseError('Failed to get messages by chat id', error);
    }
  }

  async getMessageById(id: string): Promise<MessageData[]> {
    try {
      const result = await this.db
        .select()
        .from(message)
        .where(eq(message.id, id));

      return result.map((msg: any) => ({
        id: msg.id,
        chatId: msg.chatId,
        role: msg.role,
        parts: msg.parts,
        attachments: msg.attachments,
        createdAt: msg.createdAt
      }));
    } catch (error) {
      throw new DatabaseError('Failed to get message by id', error);
    }
  }

  async deleteMessagesByChatIdAfterTimestamp(chatId: string, timestamp: Date): Promise<void> {
    try {
      await this.db
        .delete(message)
        .where(
          and(
            eq(message.chatId, chatId),
            gte(message.createdAt, timestamp)
          )
        );
    } catch (error) {
      throw new DatabaseError('Failed to delete messages by chat id after timestamp', error);
    }
  }

  // Vote operations
  async voteMessage(voteData: VoteData): Promise<void> {
    try {
      await this.db
        .insert(vote)
        .values({
          chatId: voteData.chatId,
          messageId: voteData.messageId,
          isUpvoted: voteData.isUpvoted
        });
    } catch (error) {
      throw new DatabaseError('Failed to vote message', error);
    }
  }

  async getVotesByChatId(chatId: string): Promise<VoteData[]> {
    try {
      const result = await this.db
        .select()
        .from(vote)
        .where(eq(vote.chatId, chatId));

      return result.map((v: any) => ({
        chatId: v.chatId,
        messageId: v.messageId,
        isUpvoted: v.isUpvoted
      }));
    } catch (error) {
      throw new DatabaseError('Failed to get votes by chat id', error);
    }
  }

  // Document operations
  async saveDocument(documentData: DocumentData): Promise<DocumentData> {
    try {
      const result = await this.db
        .insert(document)
        .values({
          id: documentData.id,
          title: documentData.title,
          content: documentData.content,
          kind: documentData.kind,
          userId: documentData.userId,
          createdAt: documentData.createdAt
        })
        .returning();

      return result[0];
    } catch (error) {
      throw new DatabaseError('Failed to save document', error);
    }
  }

  async getDocumentsById(id: string): Promise<DocumentData[]> {
    try {
      const result = await this.db
        .select()
        .from(document)
        .where(eq(document.id, id))
        .orderBy(asc(document.createdAt));

      return result;
    } catch (error) {
      throw new DatabaseError('Failed to get documents by id', error);
    }
  }

  async getDocumentById(id: string): Promise<DocumentData | null> {
    try {
      const result = await this.db
        .select()
        .from(document)
        .where(eq(document.id, id))
        .orderBy(desc(document.createdAt))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      throw new DatabaseError('Failed to get document by id', error);
    }
  }

  async deleteDocumentsByIdAfterTimestamp(id: string, timestamp: Date): Promise<DocumentData[]> {
    try {
      // Delete suggestions first
      await this.db
        .delete(suggestion)
        .where(
          and(
            eq(suggestion.documentId, id),
            gt(suggestion.documentCreatedAt, timestamp)
          )
        );

      const result = await this.db
        .delete(document)
        .where(
          and(
            eq(document.id, id),
            gt(document.createdAt, timestamp)
          )
        )
        .returning();

      return result;
    } catch (error) {
      throw new DatabaseError('Failed to delete documents by id after timestamp', error);
    }
  }

  // Suggestion operations
  async saveSuggestions(suggestions: SuggestionData[]): Promise<void> {
    try {
      const suggestionsToInsert = suggestions.map(suggestion => ({
        id: suggestion.id,
        documentId: suggestion.documentId,
        documentCreatedAt: suggestion.documentCreatedAt,
        originalText: suggestion.originalText,
        suggestedText: suggestion.suggestedText,
        description: suggestion.description,
        isResolved: suggestion.isResolved,
        userId: suggestion.userId,
        createdAt: suggestion.createdAt
      }));

      await this.db.insert(suggestion).values(suggestionsToInsert);
    } catch (error) {
      throw new DatabaseError('Failed to save suggestions', error);
    }
  }

  async getSuggestionsByDocumentId(documentId: string): Promise<SuggestionData[]> {
    try {
      const result = await this.db
        .select()
        .from(suggestion)
        .where(eq(suggestion.documentId, documentId));

      return result;
    } catch (error) {
      throw new DatabaseError('Failed to get suggestions by document id', error);
    }
  }

  // Utility operations
  async getMessageCountByUserId(userId: string, hours: number): Promise<number> {
    try {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      const result = await this.db
        .select({ count: count() })
        .from(message)
        .innerJoin(chat, eq(message.chatId, chat.id))
        .where(
          and(
            eq(chat.userId, userId),
            gte(message.createdAt, since),
            eq(message.role, 'user')
          )
        );

      return result[0]?.count || 0;
    } catch (error) {
      throw new DatabaseError('Failed to get message count by user id', error);
    }
  }

  async createStreamId(streamId: string, chatId: string): Promise<void> {
    try {
      await this.db
        .insert(stream)
        .values({
          id: streamId,
          chatId,
          createdAt: new Date()
        });
    } catch (error) {
      throw new DatabaseError('Failed to create stream id', error);
    }
  }

  async getStreamIdsByChatId(chatId: string): Promise<string[]> {
    try {
      const result = await this.db
        .select({ id: stream.id })
        .from(stream)
        .where(eq(stream.chatId, chatId))
        .orderBy(asc(stream.createdAt));

      return result.map((s: any) => s.id);
    } catch (error) {
      throw new DatabaseError('Failed to get stream ids by chat id', error);
    }
  }

  // Schema management (placeholder implementations)
  async getSchemaVersion(clientId: string): Promise<string> {
    return '1.0.0';
  }

  async migrateSchema(clientId: string, targetVersion: string): Promise<void> {
    console.log(`Migrating PostgreSQL schema for client ${clientId} to version ${targetVersion}`);
  }

  async validateSchema(clientId: string): Promise<SchemaValidationResult> {
    return {
      isValid: true,
      errors: [],
      warnings: []
    };
  }

  // Transaction support
  async beginTransaction(): Promise<void> {
    await this.client.begin();
  }

  async commitTransaction(): Promise<void> {
    await this.client.commit();
  }

  async rollbackTransaction(): Promise<void> {
    await this.client.rollback();
  }
}

// Import schema tables (these would normally be imported from your existing schema file)
import {
  user,
  chat,
  message,
  vote,
  document,
  suggestion,
  stream
} from '../schema';

import {
  eq,
  desc,
  asc,
  gte,
  gt,
  and,
  count
} from 'drizzle-orm';