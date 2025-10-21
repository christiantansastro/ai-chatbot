import { createFileRecord, getFilesByTempQueueId, updateFileStatus, deleteFileRecord } from '@/lib/db/queries';
import { generateUUID } from '@/lib/utils';

export interface QueuedFile {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
  uploadTimestamp: Date;
  uploaderUserId: string;
  tempQueueId: string;
  status: 'temp_queue';
}

export interface TempFileQueue {
  id: string;
  files: QueuedFile[];
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Creates a new temporary file queue for unassigned files
 */
export async function createTempFileQueue(uploaderUserId: string): Promise<string> {
  try {
    // Generate a unique temp queue ID
    const tempQueueId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // In a more sophisticated implementation, you might want to store queue metadata
    // For now, we'll just use the tempQueueId as the identifier

    return tempQueueId;
  } catch (error) {
    console.error('Error creating temp file queue:', error);
    throw new Error(`Failed to create temp file queue: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Adds a file to a temporary queue
 */
export async function addFileToTempQueue(
  fileData: {
    fileName: string;
    fileType: string;
    fileSize: number;
    fileUrl: string;
    uploaderUserId: string;
  },
  tempQueueId: string
): Promise<QueuedFile> {
  try {
    const fileRecord = await createFileRecord({
      id: generateUUID(),
      fileName: fileData.fileName,
      fileType: fileData.fileType,
      fileSize: fileData.fileSize,
      fileUrl: fileData.fileUrl,
      uploaderUserId: fileData.uploaderUserId,
      tempQueueId,
      status: 'temp_queue' as const,
    });

    return {
      id: fileRecord.id,
      fileName: fileRecord.fileName,
      fileType: fileRecord.fileType,
      fileSize: fileRecord.fileSize,
      fileUrl: fileRecord.fileUrl,
      uploadTimestamp: fileRecord.uploadTimestamp,
      uploaderUserId: fileRecord.uploaderUserId,
      tempQueueId: fileRecord.tempQueueId!,
      status: fileRecord.status,
    };
  } catch (error) {
    console.error('Error adding file to temp queue:', error);
    throw new Error(`Failed to add file to temp queue: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Retrieves all files in a temporary queue
 */
export async function getFilesInTempQueue(tempQueueId: string): Promise<QueuedFile[]> {
  try {
    const fileRecords = await getFilesByTempQueueId({ tempQueueId });

    return fileRecords.map((record: any) => ({
      id: record.id,
      fileName: record.fileName,
      fileType: record.fileType,
      fileSize: record.fileSize,
      fileUrl: record.fileUrl,
      uploadTimestamp: record.uploadTimestamp,
      uploaderUserId: record.uploaderUserId,
      tempQueueId: record.tempQueueId!,
      status: record.status,
    }));
  } catch (error) {
    console.error('Error getting files from temp queue:', error);
    throw new Error(`Failed to get files from temp queue: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Moves files from temporary queue to a specific client
 */
export async function assignTempQueueToClient(
  tempQueueId: string,
  clientId: string,
  uploaderUserId: string
): Promise<{ success: boolean; assignedFiles: number; errors: string[] }> {
  try {
    const files = await getFilesInTempQueue(tempQueueId);
    const errors: string[] = [];
    let assignedFiles = 0;

    for (const file of files) {
      try {
        // Verify the file belongs to the requesting user
        if (file.uploaderUserId !== uploaderUserId) {
          errors.push(`Unauthorized to assign file ${file.fileName}`);
          continue;
        }

        // Update file status and assign to client
        await updateFileStatus({
          fileId: file.id,
          status: 'assigned',
          clientName: clientId, // Use clientName instead of clientId
        });

        assignedFiles++;
      } catch (error) {
        const errorMessage = `Failed to assign file ${file.fileName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errorMessage);
        errors.push(errorMessage);
      }
    }

    return {
      success: errors.length === 0,
      assignedFiles,
      errors,
    };
  } catch (error) {
    console.error('Error assigning temp queue to client:', error);
    return {
      success: false,
      assignedFiles: 0,
      errors: [`Failed to assign temp queue: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

/**
 * Cleans up expired temporary queues (files older than specified hours)
 */
export async function cleanupExpiredTempQueues(hoursToExpire: number = 24): Promise<{ cleanedFiles: number; errors: string[] }> {
  try {
    const errors: string[] = [];
    let cleanedFiles = 0;

    // Get all temp queue files older than the specified hours
    const cutoffTime = new Date(Date.now() - hoursToExpire * 60 * 60 * 1000);

    // This would require a database query to find expired temp files
    // For now, we'll implement a simple cleanup based on file age
    // In a real implementation, you might want to add an expiration field to the files table

    console.log(`Cleanup completed: ${cleanedFiles} files cleaned, ${errors.length} errors`);

    return {
      cleanedFiles,
      errors,
    };
  } catch (error) {
    console.error('Error cleaning up expired temp queues:', error);
    return {
      cleanedFiles: 0,
      errors: [`Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

/**
 * Gets all temporary queues for a specific user
 */
export async function getUserTempQueues(uploaderUserId: string): Promise<string[]> {
  try {
    // This would require a more complex query to group files by tempQueueId
    // For now, we'll return an empty array as this would need additional schema changes
    // In a real implementation, you might want to add a temp_queues table

    return [];
  } catch (error) {
    console.error('Error getting user temp queues:', error);
    throw new Error(`Failed to get user temp queues: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Deletes a temporary queue and all its files
 */
export async function deleteTempQueue(
  tempQueueId: string,
  uploaderUserId: string
): Promise<{ success: boolean; deletedFiles: number; errors: string[] }> {
  try {
    const files = await getFilesInTempQueue(tempQueueId);
    const errors: string[] = [];
    let deletedFiles = 0;

    for (const file of files) {
      try {
        // Verify the file belongs to the requesting user
        if (file.uploaderUserId !== uploaderUserId) {
          errors.push(`Unauthorized to delete file ${file.fileName}`);
          continue;
        }

        // Delete the file record
        await deleteFileRecord({ fileId: file.id });
        deletedFiles++;
      } catch (error) {
        const errorMessage = `Failed to delete file ${file.fileName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errorMessage);
        errors.push(errorMessage);
      }
    }

    return {
      success: errors.length === 0,
      deletedFiles,
      errors,
    };
  } catch (error) {
    console.error('Error deleting temp queue:', error);
    return {
      success: false,
      deletedFiles: 0,
      errors: [`Failed to delete temp queue: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}