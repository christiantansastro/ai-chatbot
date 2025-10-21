import { tool } from "ai";
import { z } from "zod";
import { createClient } from '@supabase/supabase-js';
import { createFileRecord } from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";

export const fileStorage = tool({
  description: "COMPLETES the file storage process for uploaded files. This tool should be called when files have been uploaded and need to be permanently stored. It handles the entire storage pipeline and provides final confirmation. After successful completion, no further file storage actions are needed. DO NOT ask for files that have already been stored.",
  inputSchema: z.object({
    chatId: z.string().optional().describe("Chat ID to retrieve temp files from sessionStorage (client-side only)"),
    clientName: z.string().optional().describe("Name of the client to associate files with"),
    files: z.array(z.object({
      tempId: z.string(),
      filename: z.string(),
      contentType: z.string(),
      size: z.number(),
      fileBuffer: z.string(), // base64 encoded file data
    })).optional().describe("Array of file data objects (for server-side usage)"),
  }),
  execute: async ({ chatId, clientName, files }) => {
    try {
      console.log(`📁 FILE STORAGE TOOL: Storing files for chat ${chatId || 'server-side'}, client: ${clientName || 'none'}`);

      let tempFiles: any[] = [];

      // Handle different execution contexts
      if (typeof window !== 'undefined' && chatId && !files) {
        // Client-side: Get temp files from sessionStorage
        const tempFilesData = sessionStorage.getItem(`tempFiles_${chatId}`);
        if (!tempFilesData) {
          return {
            success: false,
            message: 'No temp files found for this chat',
            storedFiles: [],
          };
        }

        const parsedData = JSON.parse(tempFilesData);
        tempFiles = Array.isArray(parsedData) ? parsedData : [];

        console.log(`📁 FILE STORAGE TOOL: Found ${tempFiles.length} temp files in sessionStorage:`, tempFiles.map(f => f.filename));
      } else if (files && Array.isArray(files)) {
        // Server-side: Use provided file data
        tempFiles = files;
        console.log(`📁 FILE STORAGE TOOL: Processing ${tempFiles.length} provided files:`, tempFiles.map(f => f.filename));
      } else {
        return {
          success: false,
          message: 'No files to store. Please ensure you have uploaded a file and it is attached to your message.',
          storedFiles: [],
        };
      }

      if (tempFiles.length === 0) {
        return {
          success: false,
          message: 'No files to store',
          storedFiles: [],
        };
      }

      // Filter out any invalid or test files
      const validFiles = tempFiles.filter(file => {
        const isValid = file.filename &&
                       file.fileBuffer &&
                       file.filename !== 'test1.txt' &&
                       !file.filename.startsWith('test') &&
                       file.size > 0;

        if (!isValid) {
          console.log(`📁 FILE STORAGE TOOL: Filtering out invalid file: ${file.filename || 'unnamed'}`);
        }

        return isValid;
      });

      if (validFiles.length === 0) {
        return {
          success: false,
          message: 'No valid files to store. Please upload a real file.',
          storedFiles: [],
        };
      }

      console.log(`📁 FILE STORAGE TOOL: Processing ${validFiles.length} valid files out of ${tempFiles.length} total`);

      // Initialize Supabase client
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const storedFiles: Array<{
        id: string;
        url: string;
        name: string;
        contentType: string;
      }> = [];

      // Find existing client by enhanced search
      let foundClientName: string | null = null;

      if (clientName) {
        try {
          console.log(`📁 FILE STORAGE TOOL: Enhanced client lookup for "${clientName}"`);

          // Use the same enhanced search as validation function
          const similarityThreshold = 0.6;

          const response = await supabase.rpc('search_clients_precise', {
            search_query: clientName,
            similarity_threshold: similarityThreshold,
            max_results: 1
          });

          // Handle different response formats
          let data = null;
          if (Array.isArray(response)) {
            data = response;
          } else if (response && typeof response === 'object' && response.data !== undefined) {
            data = response.data;
          } else if (response && typeof response === 'object') {
            data = response;
          }

          // Ensure data is an array
          if (data && !Array.isArray(data)) {
            data = [data];
          }

          if (data && Array.isArray(data) && data.length > 0) {
            foundClientName = data[0].client_name || data[0].name;
            console.log(`📁 FILE STORAGE TOOL: Found client for "${clientName}" via RPC`);
          } else {
            console.log(`📁 FILE STORAGE TOOL: No client found for "${clientName}" - storing with client name only`);
            foundClientName = clientName;
          }
        } catch (error) {
          console.error('📁 FILE STORAGE TOOL: Enhanced client lookup error:', error);
          foundClientName = clientName;
        }
      }


      // Store each valid file
      for (const tempFile of validFiles) {
        try {
          // Validate file data before processing
          if (!tempFile.filename || !tempFile.fileBuffer) {
            console.error(`📁 FILE STORAGE TOOL: Invalid file data for ${tempFile.filename || 'unknown file'}`);
            continue;
          }

          console.log(`📁 FILE STORAGE TOOL: Processing file ${tempFile.filename} (${tempFile.size} bytes, ${tempFile.contentType})`);

          // Generate a proper UUID for the file ID if tempId is not a valid UUID
          const fileId = (tempFile.tempId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tempFile.tempId))
            ? tempFile.tempId
            : generateUUID();

          const fileBuffer = Buffer.from(tempFile.fileBuffer, 'base64');

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('files')
            .upload(`uploads/${tempFile.filename}`, fileBuffer, {
              contentType: tempFile.contentType,
              upsert: true
            });

          if (uploadError || !uploadData?.path) {
            console.error(`📁 FILE STORAGE TOOL: Storage error for ${tempFile.filename}:`, uploadError);
            continue;
          }

          const { data: urlData } = supabase.storage
            .from('files')
            .getPublicUrl(uploadData.path);

          const fileRecord = await createFileRecord({
            id: fileId,
            clientName: foundClientName || clientName || 'Unassigned',
            fileName: tempFile.filename,
            fileType: tempFile.contentType,
            fileSize: tempFile.size,
            fileUrl: urlData.publicUrl,
            status: foundClientName ? 'assigned' : 'temp_queue',
          });

          storedFiles.push({
            id: fileRecord.id,
            url: urlData.publicUrl,
            name: tempFile.filename,
            contentType: tempFile.contentType,
          });

          console.log(`📁 FILE STORAGE TOOL: Successfully stored ${tempFile.filename} (${fileRecord.id})`);

        } catch (error) {
          console.error(`📁 FILE STORAGE TOOL: Error storing ${tempFile.filename}:`, error);
        }
      }

      const successCount = storedFiles.length;
      const totalCount = validFiles.length;

      if (successCount === 0) {
        return {
          success: false,
          message: `Failed to store any of the ${totalCount} file(s)`,
          storedFiles: [],
        };
      }

      // Create a definitive completion response that prevents further file storage requests
      const fileList = storedFiles.map(file => `• ${file.name} (${file.contentType})`).join('\n');
      const clientInfo = foundClientName ? ` for client "${foundClientName}"` : ' without client association';

      // Return a standardized completion response
      // Return the standard completion response that the AI agent expects
      // Return simple, generic response
      return {
        success: true,
        message: `File storage completed.`,
        storedFiles,
        clientName: foundClientName
      };

    } catch (error) {
      console.error('📁 FILE STORAGE TOOL: General error:', error);
      return {
        success: false,
        message: `Error storing files: ${error instanceof Error ? error.message : 'Unknown error'}`,
        storedFiles: [],
      };
    }
  },
});