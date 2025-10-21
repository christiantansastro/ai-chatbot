import type { ArtifactKind } from "@/components/artifact";
import type { VisibilityType } from "@/components/visibility-selector";
import { ChatSDKError } from "../errors";
import type { AppUsage } from "../usage";
import { generateUUID } from "../utils";
import { databaseService } from "./database-factory";
import { generateHashedPassword } from "./utils";

// Type definitions for our database operations
interface User {
  id: string;
  email: string;
  password_hash?: string;
  user_metadata?: any;
  created_at?: Date;
  updated_at?: Date;
}

interface Chat {
  id: string;
  userId: string;
  title: string;
  visibility: 'public' | 'private';
  lastContext?: any;
  createdAt: Date;
  updatedAt: Date;
}

interface DBMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'system';
  parts: any[];
  attachments?: any[];
  createdAt: Date;
}

interface Vote {
  chatId: string;
  messageId: string;
  isUpvoted: boolean;
}

interface Document {
  id: string;
  title: string;
  content?: string;
  kind: ArtifactKind;
  userId: string;
  createdAt: Date;
}

interface Suggestion {
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

interface FileRecord {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
  uploadTimestamp: Date;
  uploaderUserId?: string; // Made optional since column was removed
  tempQueueId?: string;
  status: 'assigned' | 'temp_queue' | 'error';
  createdAt: Date;
  updatedAt: Date;
}

export async function getUser(email: string): Promise<User[]> {
  try {
    return await databaseService.getUser(email);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get user by email"
    );
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    return await databaseService.createUser({
      id: generateUUID(),
      email,
      password: hashedPassword,
      type: 'regular'
    });
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to create user");
  }
}

export async function createGuestUser() {
  const email = `guest-${Date.now()}`;
  const password = generateHashedPassword(generateUUID());

  try {
    const guestUser = await databaseService.createGuestUser();
    return {
      id: guestUser.id,
      email: guestUser.email,
    };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create guest user"
    );
  }
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  try {
    const savedChat = await databaseService.saveChat({
      id,
      userId,
      title,
      visibility,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastContext: {}
    });

    // Return the saved chat data (which includes the database-generated ID)
    return savedChat;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to save chat");
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    return await databaseService.deleteChatById(id);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete chat by id"
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const options: any = { limit };

    if (startingAfter || endingBefore) {
      // For Supabase, we'll need to implement pagination differently
      // This is a simplified version - in production you might want to use cursors
      const chats = await databaseService.getChatsByUserId(id, options);
      return chats;
    } else {
      const chats = await databaseService.getChatsByUserId(id, options);
      return chats;
    }
  } catch (error) {
    console.error('Error in getChatsByUserId:', error);
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get chats by user id"
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    return await databaseService.getChatById(id);
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get chat by id");
  }
}

export async function saveMessages({ messages }: { messages: DBMessage[] }) {
  try {
    await databaseService.saveMessages(messages);
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to save messages");
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await databaseService.getMessagesByChatId(id);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get messages by chat id"
    );
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: "up" | "down";
}) {
  try {
    await databaseService.voteMessage({
      chatId,
      messageId,
      isUpvoted: type === "up"
    });
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to vote message");
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await databaseService.getVotesByChatId(id);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get votes by chat id"
    );
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    const result = await databaseService.saveDocument({
      id,
      title,
      content,
      kind,
      userId,
      createdAt: new Date()
    });
    return result;
  } catch (error) {
    console.error('📄 DB QUERIES: Failed to save document:', error);
    throw new ChatSDKError("bad_request:database", "Failed to save document");
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    return await databaseService.getDocumentsById(id);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get documents by id"
    );
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    return await databaseService.getDocumentById(id);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get document by id"
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    return await databaseService.deleteDocumentsByIdAfterTimestamp(id, timestamp);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete documents by id after timestamp"
    );
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  try {
    await databaseService.saveSuggestions(suggestions);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to save suggestions"
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await databaseService.getSuggestionsByDocumentId(documentId);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get suggestions by document id"
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await databaseService.getMessageById(id);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get message by id"
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    await databaseService.deleteMessagesByChatIdAfterTimestamp(chatId, timestamp);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete messages by chat id after timestamp"
    );
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  try {
    await databaseService.updateChatVisibility(chatId, visibility);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update chat visibility by id"
    );
  }
}

export async function updateChatLastContextById({
  chatId,
  context,
}: {
  chatId: string;
  // Store merged server-enriched usage object
  context: AppUsage;
}) {
  try {
    await databaseService.updateChatLastContext(chatId, context);
  } catch (error) {
    console.warn("Failed to update lastContext for chat", chatId, error);
    return;
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  try {
    return await databaseService.getMessageCountByUserId(id, differenceInHours);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get message count by user id"
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await databaseService.createStreamId(streamId, chatId);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create stream id"
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    return await databaseService.getStreamIdsByChatId(chatId);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get stream ids by chat id"
    );
  }
}

// File operations
export async function createFileRecord(fileData: {
  id: string;
  clientName?: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
  uploaderUserId?: string; // Made optional
  tempQueueId?: string;
  status?: 'assigned' | 'temp_queue' | 'error';
}) {
  try {
    return await databaseService.createFileRecord({
      ...fileData,
      uploadTimestamp: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      status: fileData.status || 'assigned',
    });
  } catch (error) {
    console.error('Failed to create file record:', error);
    throw new ChatSDKError("bad_request:database", "Failed to create file record");
  }
}

export async function getFilesByClientId({ clientId }: { clientId: string }) {
  try {
    return await databaseService.getFilesByClientId(clientId);
  } catch (error) {
    console.error('Failed to get files by client name:', error);
    throw new ChatSDKError("bad_request:database", "Failed to get files by client name");
  }
}

export async function getFilesByTempQueueId({ tempQueueId }: { tempQueueId: string }) {
  try {
    return await databaseService.getFilesByTempQueueId(tempQueueId);
  } catch (error) {
    console.error('Failed to get files by temp queue ID:', error);
    throw new ChatSDKError("bad_request:database", "Failed to get files by temp queue ID");
  }
}

export async function updateFileStatus({
  fileId,
  status,
  clientName,
}: {
  fileId: string;
  status: 'assigned' | 'temp_queue' | 'error';
  clientName?: string;
}) {
  try {
    return await databaseService.updateFileStatus(fileId, status, clientName);
  } catch (error) {
    console.error('Failed to update file status:', error);
    throw new ChatSDKError("bad_request:database", "Failed to update file status");
  }
}

export async function deleteFileRecord({ fileId }: { fileId: string }) {
  try {
    return await databaseService.deleteFileRecord(fileId);
  } catch (error) {
    console.error('Failed to delete file record:', error);
    throw new ChatSDKError("bad_request:database", "Failed to delete file record");
  }
}

export async function createTempQueue() {
  try {
    return await databaseService.createTempQueue();
  } catch (error) {
    console.error('Failed to create temp queue:', error);
    throw new ChatSDKError("bad_request:database", "Failed to create temp queue");
  }
}

// Test function to verify database operations
export async function testDatabaseOperations(userId: string) {
  try {

    // Initialize database service if not already initialized
    try {
      const { databaseService, DatabaseConfigLoader } = await import("./database-factory");
      const config = DatabaseConfigLoader.loadFromEnvironment();
      await databaseService.initialize(config);
    } catch (initError) {
    }

    // Test if we can access the database service
    const healthCheck = await databaseService.healthCheck();
    if (healthCheck.status !== 'healthy') {
      throw new Error(`Database not healthy: ${healthCheck.details.error}`);
    }

    // Call the test function on the Supabase adapter
    const adapter = (databaseService as any).getAdapter();
    if (adapter && typeof adapter.testChatInsert === 'function') {
      const result = await adapter.testChatInsert(userId);
      return result;
    } else {
      throw new Error('Test function not available on adapter');
    }
  } catch (error) {
    console.error('Database test failed:', error);
    throw new ChatSDKError("bad_request:database", "Database test failed");
  }
}
