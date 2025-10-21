import { createClient, SupabaseClient, type PostgrestError } from '@supabase/supabase-js';
import type {
  DatabaseConfig,
  SupabaseConfig,
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

export class SupabaseAdapter implements DatabaseAdapter {
  private supabase!: SupabaseClient;
  private serviceSupabase!: SupabaseClient;
  private clientId: string = 'default';
  private isConnectedFlag = false;

  async connect(config: SupabaseConfig): Promise<void> {
    try {
      console.log('=== DATABASE CONNECTION DEBUG ===');
      console.log('Config:', {
        url: config.url,
        hasKey: !!config.key,
        hasServiceRoleKey: !!config.serviceRoleKey,
        clientId: config.clientId
      });

      // Regular client for normal operations
      this.supabase = createClient(config.url, config.key, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });

      // Service role client for admin operations (bypasses RLS)
      if (config.serviceRoleKey) {
        console.log('Creating service role client...');
        this.serviceSupabase = createClient(config.url, config.serviceRoleKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        });
        console.log('Service role client created successfully');
      } else {
        console.log('No service role key provided');
      }

      this.clientId = config.clientId || 'default';
      this.isConnectedFlag = true;

      // Test connection with service role client if available
      const testClient = this.serviceSupabase || this.supabase;
      console.log('Testing connection with client:', !!this.serviceSupabase ? 'service role' : 'regular');

      try {
        const result = await testClient.from('users').select('count').limit(1);
        console.log('Database connection test successful:', result);
      } catch (testError) {
        console.warn('Database connection test failed, but continuing:', testError);
        // Don't fail the connection if the test fails - the tables might not exist yet
      }
    } catch (error) {
      console.error('Failed to connect to Supabase:', error);
      this.isConnectedFlag = false;
      throw new DatabaseError('Failed to connect to Supabase', error);
    }
  }

  async disconnect(): Promise<void> {
    this.isConnectedFlag = false;
  }

  isConnected(): boolean {
    return this.isConnectedFlag;
  }

  // User operations
  async getUser(email: string): Promise<UserData[]> {
    try {
      // Use service role client to bypass RLS for reading
      const client = this.serviceSupabase || this.supabase;

      const { data, error } = await client
        .from('users')
        .select('*')
        .eq('email', email);

      if (error) throw error;
      return data || [];
    } catch (error) {
      throw new DatabaseError('Failed to get user', error);
    }
  }

  async createUser(userData: UserData): Promise<UserData> {
    try {
      console.log('=== CREATE USER DEBUG ===');
      console.log('Creating user:', {
        id: userData.id,
        email: userData.email,
        type: userData.type
      });

      // Check if user already exists in our users table
      const existingUsers = await this.getUser(userData.email);
      console.log('Existing users found:', existingUsers.length);

      if (existingUsers.length > 0) {
        console.log('User already exists, returning existing user');
        return existingUsers[0];
      }

      // Use service role client to bypass RLS policies for user creation
      const client = this.serviceSupabase || this.supabase;
      console.log('Using service role client for user creation:', !!this.serviceSupabase);

      // Create user record in our users table (not Supabase Auth)
      // The user should already exist in Supabase Auth
      const insertData = {
        id: userData.id, // Use the Supabase Auth user ID
        email: userData.email,
        password_hash: userData.password || '', // We don't store passwords in our DB
        user_metadata: { type: userData.type || 'regular' }
      };

      console.log('Inserting user data:', insertData);

      const { data, error } = await client
        .from('users')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('=== USER CREATION ERROR ===');
        console.error('Error:', error);
        throw error;
      }

      console.log('=== USER CREATED SUCCESSFULLY ===');
      console.log('Created user:', data);
      return data;
    } catch (error) {
      console.error('=== FAILED TO CREATE USER ===');
      console.error('Error:', error);
      throw new DatabaseError('Failed to create user', error);
    }
  }

  async createGuestUser(): Promise<UserData> {
    try {
      // Generate a unique email for the guest user
      const email = `guest-${Date.now()}@guest.local`;

      // Use service role client to bypass RLS for guest user creation
      const client = this.serviceSupabase || this.supabase;

      // Create guest user in Supabase Auth first
      const { data: authData, error: authError } = await this.supabase.auth.signUp({
        email,
        password: 'guest-password-123', // Dummy password for guest users
        options: {
          data: {
            type: 'guest'
          }
        }
      });

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error('Failed to create guest user in Supabase Auth');
      }

      // Create user record in our users table
      const { data, error } = await client
        .from('users')
        .insert({
          id: authData.user.id,
          email,
          password_hash: '', // No password needed for guest users
          user_metadata: { type: 'guest' }
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      throw new DatabaseError('Failed to create guest user', error);
    }
  }

  // Chat operations
  async saveChat(chatData: ChatData): Promise<ChatData> {
    try {
      console.log('=== SAVE CHAT DEBUG ===');
      console.log('Input data:', {
        id: chatData.id,
        userId: chatData.userId,
        title: chatData.title,
        visibility: chatData.visibility,
        lastContext: chatData.lastContext,
        createdAt: chatData.createdAt,
        updatedAt: chatData.updatedAt
      });

      // Use service role client to bypass RLS for chat creation
      const client = this.serviceSupabase || this.supabase;
      console.log('Using service role client:', !!this.serviceSupabase);

      // First, let's check if the user exists
      console.log('Checking if user exists...');
      const existingUsers = await client
        .from('users')
        .select('id')
        .eq('id', chatData.userId);

      console.log('User exists check result:', existingUsers);

      // Use the provided ID instead of letting the database generate one
      const insertData = {
        id: chatData.id, // Use the provided ID
        user_id: chatData.userId,
        title: chatData.title,
        visibility: chatData.visibility,
        metadata: chatData.lastContext || {},
        created_at: chatData.createdAt?.toISOString(),
        updated_at: chatData.updatedAt?.toISOString()
      };

      console.log('Inserting chat data:', insertData);

      const { data, error } = await client
        .from('chats')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('=== CHAT INSERT ERROR ===');
        console.error('Error details:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error details:', error.details);
        console.error('Error hint:', error.hint);
        throw error;
      }

      console.log('=== CHAT SAVED SUCCESSFULLY ===');
      console.log('Saved chat data:', data);

      // Return the chat data with the provided ID
      return {
        id: data.id,
        userId: data.user_id,
        title: data.title,
        visibility: data.visibility,
        lastContext: data.metadata,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };
    } catch (error) {
      console.error('=== FAILED TO SAVE CHAT ===');
      console.error('Error:', error);
      throw new DatabaseError('Failed to save chat', error);
    }
  }

  async getChatById(id: string): Promise<ChatData | null> {
    try {
      // Use service role client to bypass RLS for reading
      const client = this.serviceSupabase || this.supabase;

      const { data, error } = await client
        .from('chats')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }

      return {
        id: data.id,
        userId: data.user_id,
        title: data.title,
        visibility: data.visibility,
        lastContext: data.metadata,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
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
      // Use service role client to bypass RLS for reading
      const client = this.serviceSupabase || this.supabase;

      let query = client
        .from('chats')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (options.limit) {
        query = query.limit(options.limit + 1); // +1 to check if there are more
      }

      const { data, error } = await query;

      if (error) throw error;

      // Remove duplicates based on chat ID
      const uniqueData = (data || []).filter(
        (chat: any, index: number, self: any[]) =>
          self.findIndex((c: any) => c.id === chat.id) === index
      );

      const chats = uniqueData.map((chat: any) => ({
        id: chat.id,
        userId: chat.user_id,
        title: chat.title,
        visibility: chat.visibility,
        lastContext: chat.metadata,
        createdAt: new Date(chat.created_at),
        updatedAt: new Date(chat.updated_at)
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
      // Use service role client to bypass RLS for deletion
      const client = this.serviceSupabase || this.supabase;

      // Delete related data first (votes, messages, streams)
      await client.from('votes').delete().eq('chat_id', id);
      await client.from('messages').delete().eq('chat_id', id);
      await client.from('streams').delete().eq('chat_id', id);

      const { data, error } = await client
        .from('chats')
        .delete()
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return {
        id: data.id,
        userId: data.user_id,
        title: data.title,
        visibility: data.visibility,
        lastContext: data.metadata,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };
    } catch (error) {
      throw new DatabaseError('Failed to delete chat by id', error);
    }
  }

  async updateChatVisibility(chatId: string, visibility: 'public' | 'private'): Promise<void> {
    try {
      // Use service role client to bypass RLS for updates
      const client = this.serviceSupabase || this.supabase;

      const { error } = await client
        .from('chats')
        .update({ visibility, updated_at: new Date().toISOString() })
        .eq('id', chatId);

      if (error) throw error;
    } catch (error) {
      throw new DatabaseError('Failed to update chat visibility', error);
    }
  }

  async updateChatLastContext(chatId: string, context: any): Promise<void> {
    try {
      // Use service role client to bypass RLS for updates
      const client = this.serviceSupabase || this.supabase;

      const { error } = await client
        .from('chats')
        .update({ metadata: context, updated_at: new Date().toISOString() })
        .eq('id', chatId);

      if (error) throw error;
    } catch (error) {
      throw new DatabaseError('Failed to update chat last context', error);
    }
  }

  // Message operations
  async saveMessages(messages: MessageData[]): Promise<void> {
    try {
      console.log('=== SAVE MESSAGES DEBUG ===');
      console.log('Saving messages:', messages.length);

      // Use service role client to bypass RLS for message creation
      const client = this.serviceSupabase || this.supabase;
      console.log('Using service role client:', !!this.serviceSupabase);

      const messagesToInsert = messages.map((msg, index) => {
        console.log(`Processing message ${index}:`, {
          id: msg.id,
          chatId: msg.chatId,
          role: msg.role,
          parts: msg.parts,
          partsType: typeof msg.parts,
          partsIsArray: Array.isArray(msg.parts),
          createdAt: msg.createdAt
        });

        // Preserve the structured message parts format
        console.log(`Message ${index} parts:`, msg.parts);

        const insertData = {
          id: msg.id,
          chat_id: msg.chatId,
          role: msg.role,
          parts: msg.parts || [],
          attachments: msg.attachments || [],
          created_at: msg.createdAt.toISOString()
        };

        console.log(`Message ${index} insert data:`, insertData);
        return insertData;
      });

      console.log('Inserting messages to Supabase:', messagesToInsert);

      const { data, error } = await client
        .from('messages')
        .insert(messagesToInsert)
        .select();

      if (error) {
        console.error('=== SUPABASE INSERT ERROR ===');
        console.error('Error inserting messages:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error details:', error.details);
        console.error('Error hint:', error.hint);
        throw error;
      }

      console.log('=== MESSAGES SAVED SUCCESSFULLY ===');
      console.log('Saved messages:', data);
    } catch (error) {
      console.error('=== FAILED TO SAVE MESSAGES ===');
      console.error('Error:', error);
      throw new DatabaseError('Failed to save messages', error);
    }
  }

  async getMessagesByChatId(chatId: string, options: QueryOptions = {}): Promise<MessageData[]> {
    try {
      // Use service role client to bypass RLS for reading
      const client = this.serviceSupabase || this.supabase;

      let query = client
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map((msg: any) => ({
        id: msg.id,
        chatId: msg.chat_id,
        role: msg.role,
        parts: msg.parts || [],
        attachments: msg.attachments || [],
        createdAt: new Date(msg.created_at)
      }));
    } catch (error) {
      throw new DatabaseError('Failed to get messages by chat id', error);
    }
  }

  async getMessageById(id: string): Promise<MessageData[]> {
    try {
      // Use service role client to bypass RLS for reading
      const client = this.serviceSupabase || this.supabase;

      const { data, error } = await client
        .from('messages')
        .select('*')
        .eq('id', id);

      if (error) throw error;

      return (data || []).map((msg: any) => ({
        id: msg.id,
        chatId: msg.chat_id,
        role: msg.role,
        parts: msg.parts || [],
        attachments: msg.attachments || [],
        createdAt: new Date(msg.created_at)
      }));
    } catch (error) {
      throw new DatabaseError('Failed to get message by id', error);
    }
  }

  async deleteMessagesByChatIdAfterTimestamp(chatId: string, timestamp: Date): Promise<void> {
    try {
      // Use service role client to bypass RLS for deletion
      const client = this.serviceSupabase || this.supabase;

      const { error } = await client
        .from('messages')
        .delete()
        .eq('chat_id', chatId)
        .gte('created_at', timestamp.toISOString());

      if (error) throw error;
    } catch (error) {
      throw new DatabaseError('Failed to delete messages by chat id after timestamp', error);
    }
  }

  // Vote operations
  async voteMessage(voteData: VoteData): Promise<void> {
    try {
      // Use service role client to bypass RLS for vote creation
      const client = this.serviceSupabase || this.supabase;

      const { error } = await client
        .from('votes')
        .upsert({
          chat_id: voteData.chatId,
          message_id: voteData.messageId,
          is_upvoted: voteData.isUpvoted
        });

      if (error) throw error;
    } catch (error) {
      throw new DatabaseError('Failed to vote message', error);
    }
  }

  async getVotesByChatId(chatId: string): Promise<VoteData[]> {
    try {
      // Use service role client to bypass RLS for reading
      const client = this.serviceSupabase || this.supabase;

      const { data, error } = await client
        .from('votes')
        .select('*')
        .eq('chat_id', chatId);

      if (error) throw error;

      return (data || []).map((vote: any) => ({
        chatId: vote.chat_id,
        messageId: vote.message_id,
        isUpvoted: vote.is_upvoted
      }));
    } catch (error) {
      throw new DatabaseError('Failed to get votes by chat id', error);
    }
  }

  // Document operations
  async saveDocument(documentData: DocumentData): Promise<DocumentData> {
    try {
      console.log('📄 SUPABASE ADAPTER: Saving document', {
        id: documentData.id,
        title: documentData.title,
        kind: documentData.kind,
        userId: documentData.userId,
        contentLength: documentData.content?.length || 0
      });

      // Use service role client to bypass RLS for document creation
      const client = this.serviceSupabase || this.supabase;

      const { data, error } = await client
        .from('documents')
        .insert({
          id: documentData.id,
          title: documentData.title,
          content: documentData.content,
          kind: documentData.kind,
          user_id: documentData.userId,
          created_at: documentData.createdAt.toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('📄 SUPABASE ADAPTER: Document insert error:', error);
        console.error('📄 SUPABASE ADAPTER: Error code:', error.code);
        console.error('📄 SUPABASE ADAPTER: Error message:', error.message);
        console.error('📄 SUPABASE ADAPTER: Error details:', error.details);
        console.error('📄 SUPABASE ADAPTER: Error hint:', error.hint);
        throw error;
      }

      console.log('📄 SUPABASE ADAPTER: Document saved successfully');
      return data;
    } catch (error) {
      console.error('📄 SUPABASE ADAPTER: Failed to save document:', error);
      throw new DatabaseError('Failed to save document', error);
    }
  }

  async getDocumentsById(id: string): Promise<DocumentData[]> {
    try {
      // Use service role client to bypass RLS for reading
      const client = this.serviceSupabase || this.supabase;

      const { data, error } = await client
        .from('documents')
        .select('*')
        .eq('id', id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data || []).map((doc: any) => ({
        id: doc.id,
        title: doc.title,
        content: doc.content,
        kind: doc.kind,
        userId: doc.user_id,
        createdAt: new Date(doc.created_at)
      }));
    } catch (error) {
      throw new DatabaseError('Failed to get documents by id', error);
    }
  }

  async getDocumentById(id: string): Promise<DocumentData | null> {
    try {
      // Use service role client to bypass RLS for reading
      const client = this.serviceSupabase || this.supabase;

      const { data, error } = await client
        .from('documents')
        .select('*')
        .eq('id', id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      if (!data || data.length === 0) return null;

      const doc = data[0];
      return {
        id: doc.id,
        title: doc.title,
        content: doc.content,
        kind: doc.kind,
        userId: doc.user_id,
        createdAt: new Date(doc.created_at)
      };
    } catch (error) {
      throw new DatabaseError('Failed to get document by id', error);
    }
  }

  async deleteDocumentsByIdAfterTimestamp(id: string, timestamp: Date): Promise<DocumentData[]> {
    try {
      // Use service role client to bypass RLS for deletion
      const client = this.serviceSupabase || this.supabase;

      // Delete suggestions first
      await client
        .from('suggestions')
        .delete()
        .eq('document_id', id)
        .gt('document_created_at', timestamp.toISOString());

      const { data, error } = await client
        .from('documents')
        .delete()
        .eq('id', id)
        .gt('created_at', timestamp.toISOString())
        .select();

      if (error) throw error;

      return (data || []).map((doc: any) => ({
        id: doc.id,
        title: doc.title,
        content: doc.content,
        kind: doc.kind,
        userId: doc.user_id,
        createdAt: new Date(doc.created_at)
      }));
    } catch (error) {
      throw new DatabaseError('Failed to delete documents by id after timestamp', error);
    }
  }

  // Suggestion operations
  async saveSuggestions(suggestions: SuggestionData[]): Promise<void> {
    try {
      // Use service role client to bypass RLS for suggestion creation
      const client = this.serviceSupabase || this.supabase;

      const suggestionsToInsert = suggestions.map(suggestion => ({
        id: suggestion.id,
        document_id: suggestion.documentId,
        document_created_at: suggestion.documentCreatedAt.toISOString(),
        original_text: suggestion.originalText,
        suggested_text: suggestion.suggestedText,
        description: suggestion.description,
        is_resolved: suggestion.isResolved,
        user_id: suggestion.userId,
        created_at: suggestion.createdAt.toISOString()
      }));

      const { error } = await client
        .from('suggestions')
        .insert(suggestionsToInsert);

      if (error) throw error;
    } catch (error) {
      throw new DatabaseError('Failed to save suggestions', error);
    }
  }

  async getSuggestionsByDocumentId(documentId: string): Promise<SuggestionData[]> {
    try {
      // Use service role client to bypass RLS for reading
      const client = this.serviceSupabase || this.supabase;

      const { data, error } = await client
        .from('suggestions')
        .select('*')
        .eq('document_id', documentId);

      if (error) throw error;

      return (data || []).map((suggestion: any) => ({
        id: suggestion.id,
        documentId: suggestion.document_id,
        documentCreatedAt: new Date(suggestion.document_created_at),
        originalText: suggestion.original_text,
        suggestedText: suggestion.suggested_text,
        description: suggestion.description,
        isResolved: suggestion.is_resolved,
        userId: suggestion.user_id,
        createdAt: new Date(suggestion.created_at)
      }));
    } catch (error) {
      throw new DatabaseError('Failed to get suggestions by document id', error);
    }
  }

  // Utility operations
  async getMessageCountByUserId(userId: string, hours: number): Promise<number> {
    try {
      // Use service role client to bypass RLS for reading
      const client = this.serviceSupabase || this.supabase;

      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      console.log(`Getting message count for user ${userId} since ${since.toISOString()}`);

      // First get all chat IDs for the user
      const { data: chats, error: chatsError } = await client
        .from('chats')
        .select('id')
        .eq('user_id', userId);

      if (chatsError) {
        console.error('Error fetching chats:', chatsError);
        throw chatsError;
      }

      console.log(`Found ${chats?.length || 0} chats for user ${userId}`);

      if (!chats || chats.length === 0) {
        console.log('No chats found for user, returning 0');
        return 0; // No chats found for user
      }

      const chatIds = chats.map(chat => chat.id);
      console.log(`Chat IDs: ${chatIds.join(', ')}`);

      // Count messages for all user's chats
      const { count, error } = await client
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'user')
        .gte('created_at', since.toISOString())
        .in('chat_id', chatIds);

      if (error) {
        console.error('Error counting messages:', error);
        throw error;
      }

      console.log(`Found ${count || 0} messages for user ${userId}`);
      return count || 0;
    } catch (error) {
      console.error('Failed to get message count by user id:', error);
      throw new DatabaseError('Failed to get message count by user id', error);
    }
  }

  async createStreamId(streamId: string, chatId: string): Promise<void> {
    try {
      // Use service role client to bypass RLS for stream creation
      const client = this.serviceSupabase || this.supabase;

      const { error } = await client
        .from('streams')
        .insert({
          id: streamId,
          chat_id: chatId,
          created_at: new Date().toISOString()
        });

      if (error) throw error;
    } catch (error) {
      throw new DatabaseError('Failed to create stream id', error);
    }
  }

  async getStreamIdsByChatId(chatId: string): Promise<string[]> {
    try {
      // Use service role client to bypass RLS for reading
      const client = this.serviceSupabase || this.supabase;

      const { data, error } = await client
        .from('streams')
        .select('id')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data || []).map((stream: any) => stream.id);
    } catch (error) {
      throw new DatabaseError('Failed to get stream ids by chat id', error);
    }
  }

  // Schema management (placeholder implementations)
  async getSchemaVersion(clientId: string): Promise<string> {
    // TODO: Implement schema version tracking
    return '1.0.0';
  }

  async migrateSchema(clientId: string, targetVersion: string): Promise<void> {
    // TODO: Implement schema migration
    console.log(`Migrating schema for client ${clientId} to version ${targetVersion}`);
  }

  async validateSchema(clientId: string): Promise<SchemaValidationResult> {
    // TODO: Implement schema validation
    return {
      isValid: true,
      errors: [],
      warnings: []
    };
  }

  // Test function to verify database operations
  async testChatInsert(userId: string): Promise<{ success: boolean; chatId?: string; error?: any }> {
    try {
      console.log('=== TESTING CHAT INSERT ===');
      console.log('Testing with userId:', userId);

      // Use service role client
      const client = this.serviceSupabase || this.supabase;
      console.log('Using service role client:', !!this.serviceSupabase);

      // Test data
      const testData = {
        user_id: userId,
        title: 'Test Chat',
        visibility: 'private',
        metadata: { test: true },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      console.log('Test insert data:', testData);

      // Try the insert
      const { data, error } = await client
        .from('chats')
        .insert(testData)
        .select()
        .single();

      if (error) {
        console.error('=== TEST INSERT FAILED ===');
        console.error('Error:', error);
        return { success: false, error };
      }

      console.log('=== TEST INSERT SUCCESSFUL ===');
      console.log('Inserted chat:', data);

      // Clean up - delete the test chat
      await client
        .from('chats')
        .delete()
        .eq('id', data.id);

      console.log('Test chat cleaned up');

      return { success: true, chatId: data.id };
    } catch (error) {
      console.error('=== TEST INSERT EXCEPTION ===');
      console.error('Error:', error);
      return { success: false, error };
    }
  }

  // File operations
  async createFileRecord(fileData: any): Promise<any> {
    try {
      console.log('📁 SUPABASE ADAPTER: Creating file record', {
        id: fileData.id,
        fileName: fileData.fileName,
        fileType: fileData.fileType,
        uploaderUserId: fileData.uploaderUserId
      });

      // Use service role client to bypass RLS for file record creation
      const client = this.serviceSupabase || this.supabase;

      // Build insert data - uploader_user_id and client_id columns have been removed from the table
      const insertData: any = {
        id: fileData.id,
        client_name: fileData.clientName,
        file_name: fileData.fileName,
        file_type: fileData.fileType,
        file_size: fileData.fileSize,
        file_url: fileData.fileUrl,
        upload_timestamp: fileData.uploadTimestamp.toISOString(),
        temp_queue_id: fileData.tempQueueId,
        status: fileData.status,
        created_at: fileData.createdAt.toISOString(),
        updated_at: fileData.updatedAt.toISOString()
      };

      // uploader_user_id column has been removed from the files table
      // Don't include it in the insert data

      const { data, error } = await client
        .from('files')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('📁 SUPABASE ADAPTER: File record insert error:', error);
        throw error;
      }

      console.log('📁 SUPABASE ADAPTER: File record created successfully');
      return data;
    } catch (error) {
      console.error('📁 SUPABASE ADAPTER: Failed to create file record:', error);
      throw new DatabaseError('Failed to create file record', error);
    }
  }

  async getFilesByClientId(clientId: string): Promise<any[]> {
    try {
      // Use service role client to bypass RLS for reading
      const client = this.serviceSupabase || this.supabase;

      const { data, error } = await client
        .from('files')
        .select('*')
        .eq('client_name', clientId) // Search by client_name instead of client_id
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((file: any) => ({
        id: file.id,
        clientName: file.client_name,
        fileName: file.file_name,
        fileType: file.file_type,
        fileSize: file.file_size,
        fileUrl: file.file_url,
        uploadTimestamp: new Date(file.upload_timestamp),
        uploaderUserId: undefined, // Column removed from database
        tempQueueId: file.temp_queue_id,
        status: file.status,
        createdAt: new Date(file.created_at),
        updatedAt: new Date(file.updated_at)
      }));
    } catch (error) {
      throw new DatabaseError('Failed to get files by client name', error);
    }
  }

  async getFilesByTempQueueId(tempQueueId: string): Promise<any[]> {
    try {
      // Use service role client to bypass RLS for reading
      const client = this.serviceSupabase || this.supabase;

      const { data, error } = await client
        .from('files')
        .select('*')
        .eq('temp_queue_id', tempQueueId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((file: any) => ({
        id: file.id,
        clientName: file.client_name,
        fileName: file.file_name,
        fileType: file.file_type,
        fileSize: file.file_size,
        fileUrl: file.file_url,
        uploadTimestamp: new Date(file.upload_timestamp),
        uploaderUserId: undefined, // Column removed from database
        tempQueueId: file.temp_queue_id,
        status: file.status,
        createdAt: new Date(file.created_at),
        updatedAt: new Date(file.updated_at)
      }));
    } catch (error) {
      throw new DatabaseError('Failed to get files by temp queue ID', error);
    }
  }

  async updateFileStatus(fileId: string, status: 'assigned' | 'temp_queue' | 'error', clientName?: string): Promise<any> {
    try {
      // Use service role client to bypass RLS for updates
      const client = this.serviceSupabase || this.supabase;

      const updateData: any = {
        status,
        updated_at: new Date().toISOString()
      };

      if (clientName) {
        updateData.client_name = clientName;
      }

      const { data, error } = await client
        .from('files')
        .update(updateData)
        .eq('id', fileId)
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        clientName: data.client_name,
        fileName: data.file_name,
        fileType: data.file_type,
        fileSize: data.file_size,
        fileUrl: data.file_url,
        uploadTimestamp: new Date(data.upload_timestamp),
        uploaderUserId: undefined, // Column removed from database
        tempQueueId: data.temp_queue_id,
        status: data.status,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };
    } catch (error) {
      throw new DatabaseError('Failed to update file status', error);
    }
  }

  async deleteFileRecord(fileId: string): Promise<any> {
    try {
      // Use service role client to bypass RLS for deletion
      const client = this.serviceSupabase || this.supabase;

      const { data, error } = await client
        .from('files')
        .delete()
        .eq('id', fileId)
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        clientName: data.client_name,
        fileName: data.file_name,
        fileType: data.file_type,
        fileSize: data.file_size,
        fileUrl: data.file_url,
        uploadTimestamp: new Date(data.upload_timestamp),
        uploaderUserId: undefined, // Column removed from database
        tempQueueId: data.temp_queue_id,
        status: data.status,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };
    } catch (error) {
      throw new DatabaseError('Failed to delete file record', error);
    }
  }

  async createTempQueue(): Promise<{ id: string }> {
    try {
      // For simplicity, we'll use a UUID as temp queue ID
      // In a real implementation, you might want a separate temp_queues table
      const tempQueueId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      return { id: tempQueueId };
    } catch (error) {
      throw new DatabaseError('Failed to create temp queue', error);
    }
  }

  // Transaction support (Supabase doesn't support transactions like PostgreSQL)
  async beginTransaction(): Promise<void> {
    // No-op for Supabase
  }

  async commitTransaction(): Promise<void> {
    // No-op for Supabase
  }

  async rollbackTransaction(): Promise<void> {
    // No-op for Supabase
  }
}