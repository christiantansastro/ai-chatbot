import { BaseAgent, AgentCategory, AgentResponse } from "./base-agent";

/**
 * Files Agent - Handles all file-related queries and operations
 */
export class FilesAgent extends BaseAgent {
  constructor() {
    super(
      "Files Agent",
      "Specialized in file management, uploads, downloads, storage, organization, and file-related operations",
      "files"
    );

    // Note: File tools would be registered here when available
    // this.registerTool("fileStorage", fileStorage);
  }

  /**
   * Check if this agent can handle a given query based on keywords and context
   */
  public canHandle(query: string): boolean {
    const lowerQuery = query.toLowerCase();

    // File-related keywords
    const fileKeywords = [
      'file', 'files', 'document', 'documents',
      'upload', 'uploads', 'download', 'downloads',
      'storage', 'store', 'save', 'saved',
      'organize', 'organization', 'folder', 'folders',
      'archive', 'archives', 'backup', 'backups',
      'pdf', 'doc', 'docx', 'txt', 'text',
      'image', 'images', 'photo', 'photos', 'picture', 'pictures',
      'video', 'videos', 'audio', 'sound',
      'spreadsheet', 'excel', 'csv', 'data',
      'report', 'reports', 'form', 'forms',
      'contract', 'contracts', 'agreement', 'agreements',
      'invoice', 'invoices', 'receipt', 'receipts',
      'certificate', 'certificates', 'license', 'licenses',
      'scan', 'scans', 'copy', 'copies',
      'attachment', 'attachments', 'attach', 'attached',
      'share', 'shared', 'sharing', 'link', 'links',
      'cloud', 'drive', 'repository', 'repo',
      'version', 'versions', 'revision', 'revisions',
      'template', 'templates', 'format', 'formatting',
      'size', 'sizes', 'large', 'small', 'big', 'little',
      'search', 'find', 'locate', 'missing', 'lost',
      'delete', 'remove', 'erase', 'clean', 'cleanup',
      'compress', 'zip', 'rar', 'extract', 'unpack',
      'print', 'printing', 'export', 'import',
      'sync', 'synchronize', 'backup', 'restore',
      'permission', 'permissions', 'access', 'security',
      'metadata', 'properties', 'information', 'info',
      'directory', 'directories', 'path', 'paths'
    ];

    // Check for file keywords
    const hasFileKeyword = fileKeywords.some(keyword => lowerQuery.includes(keyword));

    // Check for specific file operations
    const fileOperations = [
      'upload file', 'upload document', 'store file', 'save file',
      'download file', 'get file', 'retrieve file', 'access file',
      'organize files', 'manage files', 'file management',
      'search files', 'find files', 'locate files',
      'delete files', 'remove files', 'clean up files',
      'share files', 'send files', 'email files',
      'compress files', 'zip files', 'archive files',
      'file storage', 'file organization', 'file structure',
      'file permissions', 'file access', 'file security',
      'file information', 'file details', 'file properties',
      'file size', 'file type', 'file format',
      'file history', 'file versions', 'file revisions',
      // Single word operations that should trigger file handling
      'store this', 'upload this', 'save this', 'attach this'
    ];

    const hasFileOperation = fileOperations.some(operation => lowerQuery.includes(operation));

    return hasFileKeyword || hasFileOperation;
  }

  /**
   * Process a file-related query
   */
  public async processQuery(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      const lowerQuery = query.toLowerCase();

      // Determine which type of file query this is
      if (lowerQuery.includes('upload') || lowerQuery.includes('store') || lowerQuery.includes('save') ||
          (lowerQuery.includes('this') && (lowerQuery.includes('file') || lowerQuery.includes('document') || lowerQuery.includes('image')))) {
        return await this.handleFileUpload(query, context);
      } else if (lowerQuery.includes('download') || lowerQuery.includes('get') || lowerQuery.includes('retrieve')) {
        return await this.handleFileDownload(query, context);
      } else if (lowerQuery.includes('search') || lowerQuery.includes('find') || lowerQuery.includes('locate')) {
        return await this.handleFileSearch(query, context);
      } else if (lowerQuery.includes('delete') || lowerQuery.includes('remove') || lowerQuery.includes('clean')) {
        return await this.handleFileDeletion(query, context);
      } else if (lowerQuery.includes('organize') || lowerQuery.includes('manage') || lowerQuery.includes('structure')) {
        return await this.handleFileOrganization(query, context);
      } else {
        return await this.handleGeneralFileQuery(query, context);
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error processing file query: ${error instanceof Error ? error.message : 'Unknown error'}`,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: [],
          confidence: 0
        }
      };
    }
  }

  /**
   * Handle file upload requests
   */
  private async handleFileUpload(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // Extract file details from query
      const fileDetails = this.extractFileDetails(query);

      // Validate client name if provided
      if (fileDetails.clientName) {
        const clientValidation = await this.validateClientName(fileDetails.clientName);
        if (!clientValidation.exists) {
          return {
            success: false,
            message: `Client "${fileDetails.clientName}" not found. Please check the client name and try again.`,
            agent: this.name,
            category: this.category,
            metadata: {
              processingTime: Date.now() - startTime,
              toolsUsed: ['queryClients'],
              confidence: 0.9
            }
          };
        }
        fileDetails.validatedClientName = clientValidation.clientName;
      } else {
        // For file operations without client specification, we can still proceed
        // but mark as temp_queue for later assignment
        fileDetails.validatedClientName = null;
        fileDetails.status = 'temp_queue';
      }

      const clientContext = fileDetails.validatedClientName
        ? `for client: ${fileDetails.validatedClientName}`
        : 'to temporary queue (no client specified)';

      const result = {
        success: true,
        message: `File upload request validated ${clientContext}`,
        details: fileDetails,
        queryType: 'file_upload'
      };

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        message: `File upload request processed successfully ${clientContext}`,
        data: result,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: fileDetails.validatedClientName ? ['fileStorage', 'queryClients'] : ['fileStorage'],
          confidence: 0.9
        }
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error processing file upload: ${error instanceof Error ? error.message : 'Unknown error'}`,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['fileStorage'],
          confidence: 0
        }
      };
    }
  }

  /**
   * Handle file download requests
   */
  private async handleFileDownload(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // Extract file details from query
      const fileDetails = this.extractFileDetails(query);

      const result = {
        success: true,
        message: `File download request for: ${fileDetails.fileName || 'specified file'}`,
        details: fileDetails,
        queryType: 'file_download'
      };

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        message: `File download request processed successfully`,
        data: result,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['fileDownload'],
          confidence: 0.85
        }
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error processing file download: ${error instanceof Error ? error.message : 'Unknown error'}`,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['fileDownload'],
          confidence: 0
        }
      };
    }
  }

  /**
   * Handle file search requests
   */
  private async handleFileSearch(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // Extract search criteria from query
      const searchCriteria = this.extractSearchCriteria(query);

      const result = {
        success: true,
        message: `File search request with criteria: ${JSON.stringify(searchCriteria)}`,
        criteria: searchCriteria,
        queryType: 'file_search'
      };

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        message: `File search request processed successfully`,
        data: result,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['fileSearch'],
          confidence: 0.85
        }
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error processing file search: ${error instanceof Error ? error.message : 'Unknown error'}`,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['fileSearch'],
          confidence: 0
        }
      };
    }
  }

  /**
   * Handle file deletion requests
   */
  private async handleFileDeletion(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // Extract file details from query
      const fileDetails = this.extractFileDetails(query);

      const result = {
        success: true,
        message: `File deletion request for: ${fileDetails.fileName || 'specified files'}`,
        details: fileDetails,
        queryType: 'file_deletion'
      };

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        message: `File deletion request processed successfully`,
        data: result,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['fileDeletion'],
          confidence: 0.8
        }
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error processing file deletion: ${error instanceof Error ? error.message : 'Unknown error'}`,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['fileDeletion'],
          confidence: 0
        }
      };
    }
  }

  /**
   * Handle file organization requests
   */
  private async handleFileOrganization(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // Extract organization criteria from query
      const organizationCriteria = this.extractOrganizationCriteria(query);

      const result = {
        success: true,
        message: `File organization request with criteria: ${JSON.stringify(organizationCriteria)}`,
        criteria: organizationCriteria,
        queryType: 'file_organization'
      };

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        message: `File organization request processed successfully`,
        data: result,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['fileOrganization'],
          confidence: 0.8
        }
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error processing file organization: ${error instanceof Error ? error.message : 'Unknown error'}`,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['fileOrganization'],
          confidence: 0
        }
      };
    }
  }

  /**
   * Handle general file queries
   */
  private async handleGeneralFileQuery(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      const result = {
        success: true,
        message: "General file query processed",
        query: query,
        queryType: 'general_file'
      };

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        message: "File query processed successfully",
        data: result,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['generalFileTool'],
          confidence: 0.7
        }
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error processing file query: ${error instanceof Error ? error.message : 'Unknown error'}`,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['generalFileTool'],
          confidence: 0
        }
      };
    }
  }

  /**
   * Extract file details from query
   */
  private extractFileDetails(query: string): any {
    const lowerQuery = query.toLowerCase();

    return {
      fileName: this.extractFileName(query),
      fileType: this.extractFileType(query),
      fileSize: this.extractFileSize(query),
      clientName: this.extractClientNameFromQuery(query),
      urgency: this.extractUrgency(query)
    };
  }

  /**
   * Extract search criteria from query
   */
  private extractSearchCriteria(query: string): any {
    const lowerQuery = query.toLowerCase();

    return {
      fileName: this.extractFileName(query),
      fileType: this.extractFileType(query),
      clientName: this.extractClientName(query),
      dateRange: this.extractDateRange(query),
      sizeRange: this.extractSizeRange(query)
    };
  }

  /**
   * Extract organization criteria from query
   */
  private extractOrganizationCriteria(query: string): any {
    const lowerQuery = query.toLowerCase();

    return {
      organizationType: this.extractOrganizationType(query),
      targetLocation: this.extractTargetLocation(query),
      namingConvention: this.extractNamingConvention(query),
      folderStructure: this.extractFolderStructure(query)
    };
  }

  /**
   * Extract file name from query (simplified implementation)
   */
  private extractFileName(query: string): string | null {
    // Look for quoted file names or file extensions
    const patterns = [
      /["']([^"']+\.(?:pdf|doc|docx|txt|jpg|jpeg|png|gif|xls|xlsx|csv))["']/i,
      /file\s+["']?([^"'\s]+(?:\s+[^"'\s]+)*?)["']?(?:\s|$)/i,
      /document\s+["']?([^"'\s]+(?:\s+[^"'\s]+)*?)["']?(?:\s|$)/i
    ];

    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Extract file type from query (simplified implementation)
   */
  private extractFileType(query: string): string | null {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes('pdf')) return 'pdf';
    if (lowerQuery.includes('word') || lowerQuery.includes('doc')) return 'doc';
    if (lowerQuery.includes('excel') || lowerQuery.includes('spreadsheet') || lowerQuery.includes('xls')) return 'excel';
    if (lowerQuery.includes('image') || lowerQuery.includes('photo') || lowerQuery.includes('picture')) return 'image';
    if (lowerQuery.includes('text') || lowerQuery.includes('txt')) return 'text';

    return null;
  }

  /**
   * Extract file size from query (simplified implementation)
   */
  private extractFileSize(query: string): string | null {
    // Look for size indicators like "large", "small", "10MB", etc.
    const sizePatterns = [
      /(\d+)\s*(mb|gb|kb)/i,
      /(\d+)\s*(megabyte|gigabyte|kilobyte)/i,
      /\b(large|small|big|little|huge|tiny)\b/i
    ];

    for (const pattern of sizePatterns) {
      const match = query.match(pattern);
      if (match) {
        return match[0];
      }
    }

    return null;
  }

  /**
   * Extract client name from query (simplified implementation)
   */
  private extractClientName(query: string): string | null {
    // Simple extraction - look for quoted names or names after common patterns
    const patterns = [
      /client\s+["']?([^"'\s]+(?:\s+[^"'\s]+)*?)["']?(?:\s|$)/i,
      /for\s+["']?([^"'\s]+(?:\s+[^"'\s]+)*?)["']?(?:\s|$)/i,
      /["']([^"']+)["']/,
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/
    ];

    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Extract client name from query using the utility function
   */
  private extractClientNameFromQuery(query: string): string | null {
    try {
      const { extractClientNameFromQuery: extractClient } = require('@/lib/utils/client-validation');
      return extractClient(query);
    } catch (error) {
      console.error('Error extracting client name from query:', error);
      return this.extractClientName(query);
    }
  }

  /**
   * Extract urgency from query (simplified implementation)
   */
  private extractUrgency(query: string): string {
    const lowerQuery = query.toLowerCase();
    if (lowerQuery.includes('urgent') || lowerQuery.includes('asap') || lowerQuery.includes('emergency')) {
      return 'high';
    } else if (lowerQuery.includes('soon') || lowerQuery.includes('quickly')) {
      return 'medium';
    }
    return 'normal';
  }

  /**
   * Extract date range from query (simplified implementation)
   */
  private extractDateRange(query: string): any {
    // This would use a more sophisticated date extraction library in practice
    return null;
  }

  /**
   * Extract size range from query (simplified implementation)
   */
  private extractSizeRange(query: string): any {
    // This would use a more sophisticated size extraction library in practice
    return null;
  }

  /**
   * Extract organization type from query (simplified implementation)
   */
  private extractOrganizationType(query: string): string {
    const lowerQuery = query.toLowerCase();
    if (lowerQuery.includes('folder') || lowerQuery.includes('directory')) return 'folder';
    if (lowerQuery.includes('tag') || lowerQuery.includes('label')) return 'tag';
    if (lowerQuery.includes('category') || lowerQuery.includes('categorize')) return 'category';
    return 'default';
  }

  /**
   * Extract target location from query (simplified implementation)
   */
  private extractTargetLocation(query: string): string | null {
    // This would use a more sophisticated location extraction library in practice
    return null;
  }

  /**
   * Extract naming convention from query (simplified implementation)
   */
  private extractNamingConvention(query: string): string | null {
    // This would use a more sophisticated naming convention extraction library in practice
    return null;
  }

  /**
   * Extract folder structure from query (simplified implementation)
   */
  private extractFolderStructure(query: string): string | null {
    // This would use a more sophisticated folder structure extraction library in practice
    return null;
  }

  /**
   * Validate that a client name exists in the database
   */
  private async validateClientName(clientName: string): Promise<{ exists: boolean; clientName?: string }> {
    try {
      // Use the client validation utility
      const { validateClientForFileStorage } = await import('@/lib/utils/client-validation');
      const validation = await validateClientForFileStorage(clientName);

      return {
        exists: validation.isValid,
        clientName: validation.clientName
      };
    } catch (error) {
      console.error('Error validating client name:', error);
      return { exists: false };
    }
  }
}