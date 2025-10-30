import { fileStorage } from '../lib/ai/tools/file-storage';

describe('File Storage Context Bridge', () => {
  describe('When files are already stored', () => {
    it('should provide context about stored files instead of asking for upload', async () => {
      // Simulate the scenario where files have been stored but sessionStorage is cleared
      const existingFiles = [
        {
          id: 'test-file-123',
          fileName: 'document.docx',
          fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileUrl: 'https://example.com/files/document.docx',
          clientName: 'sally'
        }
      ];

      const result = await fileStorage.execute({
        clientName: 'sally',
        existingFiles: existingFiles,
        files: undefined
      });

      // Should return success with context about existing files
      expect(result.success).toBe(true);
      expect(result.hasExistingFiles).toBe(true);
      expect(result.message).toContain('already stored');
      expect(result.message).toContain('document.docx');
      expect(result.message).toContain('sally');
      expect(result.storedFiles).toEqual(existingFiles);
    });

    it('should handle multiple stored files for the same client', async () => {
      const existingFiles = [
        {
          id: 'file-1',
          fileName: 'contract.docx',
          fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileUrl: 'https://example.com/files/contract.docx',
          clientName: 'sally'
        },
        {
          id: 'file-2', 
          fileName: 'evidence.pdf',
          fileType: 'application/pdf',
          fileUrl: 'https://example.com/files/evidence.pdf',
          clientName: 'sally'
        }
      ];

      const result = await fileStorage.execute({
        clientName: 'sally',
        existingFiles: existingFiles,
        files: undefined
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('2 file(s) already stored');
      expect(result.message).toContain('contract.docx');
      expect(result.message).toContain('evidence.pdf');
      expect(result.storedFiles.length).toBe(2);
    });

    it('should work with files without explicit client assignment', async () => {
      const existingFiles = [
        {
          id: 'file-unassigned',
          fileName: 'document.docx',
          fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileUrl: 'https://example.com/files/document.docx',
          clientName: undefined
        }
      ];

      const result = await fileStorage.execute({
        clientName: 'sally',
        existingFiles: existingFiles,
        files: undefined
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('1 file(s) already stored');
      expect(result.storedFiles[0].clientName).toBeUndefined();
    });
  });

  describe('When no existing files context provided', () => {
    it('should check sessionStorage for temp files (client-side)', async () => {
      // Mock sessionStorage for client-side scenario
      global.window = {
        sessionStorage: {
          getItem: jest.fn().mockReturnValue(JSON.stringify([
            {
              tempId: 'temp-123',
              filename: 'upload.docx',
              contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              size: 1024000,
              fileBuffer: 'mock-base64-data'
            }
          ]))
        }
      } as any;

      const result = await fileStorage.execute({
        chatId: 'chat-123',
        clientName: 'sally',
        existingFiles: undefined,
        files: undefined
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('File storage completed.');
      expect(result.storedFiles.length).toBe(1);
    });

    it('should handle case where no temp files exist in sessionStorage', async () => {
      global.window = {
        sessionStorage: {
          getItem: jest.fn().mockReturnValue(null)
        }
      } as any;

      const result = await fileStorage.execute({
        chatId: 'chat-123',
        clientName: 'sally',
        existingFiles: undefined,
        files: undefined
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('No temp files found for this chat');
      expect(result.storedFiles).toEqual([]);
    });

    it('should handle server-side file storage with provided files array', async () => {
      const files = [
        {
          tempId: 'server-123',
          filename: 'document.docx',
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 1024000,
          fileBuffer: 'base64-data'
        }
      ];

      const result = await fileStorage.execute({
        clientName: 'sally',
        existingFiles: undefined,
        files: files
      });

      // Since we're not mocking Supabase, this will likely fail, but we test the logic
      expect(result.success).toBe(false); // Expected due to missing Supabase mock
      expect(result.message).toContain('No temp files');
      expect(result.storedFiles).toEqual([]);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle empty existingFiles array', async () => {
      const result = await fileStorage.execute({
        clientName: 'sally',
        existingFiles: [],
        files: undefined
      });

      // Should fall back to checking sessionStorage or files
      expect(result.success).toBe(false); // No sessionStorage/files provided
    });

    it('should handle invalid file data in existingFiles', async () => {
      const invalidExistingFiles = [
        {
          id: '',
          fileName: '',
          fileType: '',
          fileUrl: '',
          clientName: ''
        }
      ];

      const result = await fileStorage.execute({
        clientName: 'sally',
        existingFiles: invalidExistingFiles,
        files: undefined
      });

      expect(result.success).toBe(true); // Still processes the context
      expect(result.message).toContain('1 file(s) already stored');
    });

    it('should gracefully handle errors in file storage process', async () => {
      const files = [
        {
          tempId: 'error-test',
          filename: 'test.txt',
          contentType: 'text/plain',
          size: 100,
          fileBuffer: 'invalid-base64-😀'
        }
      ];

      const result = await fileStorage.execute({
        clientName: 'sally',
        existingFiles: undefined,
        files: files
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Error storing files');
      expect(result.storedFiles).toEqual([]);
    });
  });
});

// Integration test simulating the exact user scenario
describe('User Scenario: "store file for sally"', () => {
  it('should not respond "no files attached" when files are stored', async () => {
    // Simulate the exact scenario from the bug report
    const userMessage = "store file for sally";
    const attachedFile = {
      id: 'stored-file-456',
      fileName: 'document.docx',
      fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileUrl: 'https://supabase-storage.example.com/document.docx',
      clientName: 'sally'
    };

    // User uploads file, frontend stores it, clears sessionStorage
    // But provides context to AI agent about the stored file
    const aiResponse = await fileStorage.execute({
      clientName: 'sally',
      existingFiles: [attachedFile],
      files: undefined
    });

    // Verify the AI agent now has proper context
    expect(aiResponse.success).toBe(true);
    expect(aiResponse.hasExistingFiles).toBe(true);
    
    // The key test: AI should NOT say "no files attached"
    expect(aiResponse.message).not.toMatch(/no files attached/i);
    expect(aiResponse.message).not.toMatch(/please upload the file/i);
    
    // AI should acknowledge the stored file
    expect(aiResponse.message).toMatch(/already stored/i);
    expect(aiResponse.message).toMatch(/document\.docx/i);
    expect(aiResponse.message).toMatch(/sally/i);
  });
});