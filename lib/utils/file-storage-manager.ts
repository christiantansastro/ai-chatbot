import { auth } from '@/app/(auth)/auth';
import { createFileRecord, updateFileStatus } from '@/lib/db/queries';
import { identifyClientsInText, getPrimaryClientReference } from './client-identification';
import { createTempFileQueue, addFileToTempQueue, assignTempQueueToClient } from './temp-file-queue';
import { generateUUID } from '@/lib/utils';

export interface FileUploadResult {
  success: boolean;
  uploadedFiles: Array<{
    id: string;
    url: string;
    name: string;
    contentType: string;
  }>;
  tempQueueId?: string;
  needsClientAssignment: boolean;
  message?: string;
}

export interface ClientAssignmentResult {
  success: boolean;
  assignedFiles: number;
  message: string;
}

/**
 * Main file storage manager that handles the complete file upload and storage flow
 */
export class FileStorageManager {
  /**
   * Processes uploaded files and stores them with client association or temp queue
   */
  static async processUploadedFiles(
    files: Array<{
      url: string;
      name: string;
      contentType: string;
    }>,
    messageText: string,
    uploaderUserId: string
  ): Promise<FileUploadResult> {
    try {
      // Step 1: Identify clients in the message text
      const clientIdentification = await identifyClientsInText(messageText);

      // Step 2: If clients are identified, try to find them in the database
      let targetClientId: string | null = null;
      if (clientIdentification.success && clientIdentification.clients.length > 0) {
        const primaryClient = getPrimaryClientReference(clientIdentification.clients);
        if (primaryClient) {
          // Here you would typically search for the client in the database
          // For now, we'll assume the client name matches a client record
          targetClientId = await this.findClientByName(primaryClient.name);
        }
      }

      // Step 3: Store files based on client identification
      const uploadedFiles: Array<{
        id: string;
        url: string;
        name: string;
        contentType: string;
      }> = [];

      if (targetClientId) {
        // Store files directly with the identified client
        for (const file of files) {
          try {
            const fileRecord = await createFileRecord({
              id: generateUUID(),
              clientName: targetClientId, // Use clientName instead of clientId
              fileName: file.name,
              fileType: file.contentType,
              fileSize: 0, // We'll get this from the actual file later
              fileUrl: file.url,
              uploaderUserId,
              status: 'assigned',
            });

            uploadedFiles.push({
              id: fileRecord.id,
              url: file.url,
              name: file.name,
              contentType: file.contentType,
            });
          } catch (error) {
            console.error(`Failed to store file ${file.name} with client ${targetClientId}:`, error);
          }
        }

        return {
          success: true,
          uploadedFiles,
          needsClientAssignment: false,
          message: `Successfully stored ${uploadedFiles.length} file(s) for client`,
        };
      } else {
        // No client identified - use temporary queue
        const tempQueueId = await createTempFileQueue(uploaderUserId);

        for (const file of files) {
          try {
            await addFileToTempQueue({
              fileName: file.name,
              fileType: file.contentType,
              fileSize: 0, // We'll get this from the actual file later
              fileUrl: file.url,
              uploaderUserId,
            }, tempQueueId);

            uploadedFiles.push({
              id: generateUUID(), // This would come from the database record
              url: file.url,
              name: file.name,
              contentType: file.contentType,
            });
          } catch (error) {
            console.error(`Failed to store file ${file.name} in temp queue:`, error);
          }
        }

        return {
          success: true,
          uploadedFiles,
          tempQueueId,
          needsClientAssignment: true,
          message: `Files uploaded to temporary queue. Please specify the client to assign these ${uploadedFiles.length} file(s) to.`,
        };
      }
    } catch (error) {
      console.error('Error processing uploaded files:', error);
      return {
        success: false,
        uploadedFiles: [],
        needsClientAssignment: false,
        message: `Failed to process files: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Assigns files from a temporary queue to a specific client
   */
  static async assignFilesToClient(
    tempQueueId: string,
    clientName: string,
    uploaderUserId: string
  ): Promise<ClientAssignmentResult> {
    try {
      // Find the client by name
      const clientId = await this.findClientByName(clientName);

      if (!clientId) {
        return {
          success: false,
          assignedFiles: 0,
          message: `Client "${clientName}" not found. Please check the client name and try again.`,
        };
      }

      // Assign the temp queue to the client
      const result = await assignTempQueueToClient(tempQueueId, clientId, uploaderUserId);

      if (result.success) {
        return {
          success: true,
          assignedFiles: result.assignedFiles,
          message: `Successfully assigned ${result.assignedFiles} file(s) to client "${clientName}"`,
        };
      } else {
        return {
          success: false,
          assignedFiles: result.assignedFiles,
          message: `Partially assigned ${result.assignedFiles} file(s). Errors: ${result.errors.join(', ')}`,
        };
      }
    } catch (error) {
      console.error('Error assigning files to client:', error);
      return {
        success: false,
        assignedFiles: 0,
        message: `Failed to assign files: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Finds a client by name (placeholder implementation)
   * In a real implementation, this would search the clients table
   */
  private static async findClientByName(clientName: string): Promise<string | null> {
    try {
      // This is a placeholder implementation
      // In a real implementation, you would:
      // 1. Search the clients table for a matching client_name
      // 2. Use fuzzy matching if needed
      // 3. Return the client ID if found

      // For now, we'll return null to indicate no client found
      // This forces all files to go to the temp queue initially
      console.log(`Searching for client: "${clientName}"`);
      return null;
    } catch (error) {
      console.error('Error finding client by name:', error);
      return null;
    }
  }

  /**
   * Gets all files associated with a specific client
   */
  static async getClientFiles(clientId: string): Promise<any[]> {
    try {
      // This would use the getFilesByClientId function from queries
      // For now, return empty array as placeholder
      return [];
    } catch (error) {
      console.error('Error getting client files:', error);
      return [];
    }
  }

  /**
   * Gets all files in a temporary queue for a user
   */
  static async getUserTempFiles(uploaderUserId: string): Promise<any[]> {
    try {
      // This would use the getUserTempQueues and getFilesInTempQueue functions
      // For now, return empty array as placeholder
      return [];
    } catch (error) {
      console.error('Error getting user temp files:', error);
      return [];
    }
  }
}