import { toast } from 'sonner';

export interface EdgeCaseResult {
  handled: boolean;
  shouldContinue: boolean;
  message?: string;
  suggestedAction?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Comprehensive edge case handler for file operations
 */
export class EdgeCaseHandler {
  /**
   * Validates file data before processing
   */
  static validateFileData(files: any[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(files) || files.length === 0) {
      errors.push('No files provided');
      return { isValid: false, errors, warnings };
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Check required fields
      if (!file.name || typeof file.name !== 'string') {
        errors.push(`File ${i + 1}: Missing or invalid file name`);
      }

      if (!file.contentType || typeof file.contentType !== 'string') {
        errors.push(`File ${i + 1}: Missing or invalid content type`);
      }

      if (!file.url || typeof file.url !== 'string') {
        errors.push(`File ${i + 1}: Missing or invalid URL`);
      }

      // Check file name length
      if (file.name && file.name.length > 255) {
        errors.push(`File ${i + 1}: File name too long (max 255 characters)`);
      }

      // Check for potentially dangerous file names
      if (file.name && /[<>:"/\\|?*]/.test(file.name)) {
        warnings.push(`File ${i + 1}: File name contains special characters that may cause issues`);
      }

      // Validate URL format
      if (file.url && !this.isValidUrl(file.url)) {
        errors.push(`File ${i + 1}: Invalid URL format`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validates message text for client identification
   */
  static validateMessageText(text: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof text !== 'string') {
      errors.push('Message text must be a string');
      return { isValid: false, errors, warnings };
    }

    if (text.length > 10000) {
      warnings.push('Message text is very long, client identification may be less accurate');
    }

    if (text.trim().length === 0) {
      warnings.push('Empty message text provided');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Handles multiple clients mentioned in a message
   */
  static handleMultipleClients(clients: any[]): EdgeCaseResult {
    if (clients.length === 0) {
      return {
        handled: true,
        shouldContinue: true,
        message: 'No clients identified in message'
      };
    }

    if (clients.length === 1) {
      return {
        handled: true,
        shouldContinue: true,
        message: `Single client identified: ${clients[0].name}`
      };
    }

    // Multiple clients found
    const clientNames = clients.map(c => c.name).join(', ');

    return {
      handled: false,
      shouldContinue: false,
      message: `Multiple clients identified in message: ${clientNames}`,
      suggestedAction: 'Please specify which client these files should be associated with, or use the first identified client.'
    };
  }

  /**
   * Handles database errors during file operations
   */
  static handleDatabaseError(error: any, operation: string): EdgeCaseResult {
    console.error(`Database error during ${operation}:`, error);

    let userMessage = 'A database error occurred. Please try again.';
    let shouldContinue = false;

    // Handle specific database errors
    if (error.message?.includes('duplicate key')) {
      userMessage = 'A file with this name already exists. Please rename the file or contact support.';
    } else if (error.message?.includes('foreign key')) {
      userMessage = 'The specified client was not found. Please check the client name and try again.';
    } else if (error.message?.includes('permission')) {
      userMessage = 'You do not have permission to perform this operation.';
    } else if (error.message?.includes('connection')) {
      userMessage = 'Database connection error. Please check your connection and try again.';
      shouldContinue = true; // Allow retry
    }

    return {
      handled: true,
      shouldContinue,
      message: userMessage,
      suggestedAction: shouldContinue ? 'Please try again in a few moments.' : 'Please contact support if this issue persists.'
    };
  }

  /**
   * Handles network errors during file operations
   */
  static handleNetworkError(error: any, operation: string): EdgeCaseResult {
    console.error(`Network error during ${operation}:`, error);

    return {
      handled: true,
      shouldContinue: true,
      message: 'Network error occurred. Please check your connection and try again.',
      suggestedAction: 'Verify your internet connection and retry the operation.'
    };
  }

  /**
   * Handles file size limit exceeded
   */
  static handleFileSizeExceeded(fileName: string, size: number, limit: number): EdgeCaseResult {
    const sizeMB = (size / (1024 * 1024)).toFixed(2);
    const limitMB = (limit / (1024 * 1024)).toFixed(0);

    return {
      handled: true,
      shouldContinue: false,
      message: `File "${fileName}" (${sizeMB}MB) exceeds the maximum size limit of ${limitMB}MB`,
      suggestedAction: 'Please compress the file or split it into smaller parts.'
    };
  }

  /**
   * Handles unsupported file types
   */
  static handleUnsupportedFileType(fileName: string, fileType: string): EdgeCaseResult {
    return {
      handled: true,
      shouldContinue: false,
      message: `File "${fileName}" has unsupported type: ${fileType}`,
      suggestedAction: 'Please upload files in JPEG, PNG, PDF, DOC, DOCX, XLSX, or CSV format.'
    };
  }

  /**
   * Handles authentication/authorization errors
   */
  static handleAuthError(error: any, operation: string): EdgeCaseResult {
    console.error(`Auth error during ${operation}:`, error);

    return {
      handled: true,
      shouldContinue: false,
      message: 'Authentication required. Please log in and try again.',
      suggestedAction: 'Please refresh the page and log in to your account.'
    };
  }

  /**
   * Handles quota exceeded scenarios
   */
  static handleQuotaExceeded(currentUsage: number, limit: number): EdgeCaseResult {
    return {
      handled: true,
      shouldContinue: false,
      message: `Storage quota exceeded. Current usage: ${currentUsage}MB, Limit: ${limit}MB`,
      suggestedAction: 'Please delete some files or contact support to increase your storage limit.'
    };
  }

  /**
   * Generic error handler for unexpected errors
   */
  static handleUnexpectedError(error: any, operation: string): EdgeCaseResult {
    console.error(`Unexpected error during ${operation}:`, error);

    return {
      handled: true,
      shouldContinue: true,
      message: 'An unexpected error occurred. Please try again.',
      suggestedAction: 'If this issue persists, please contact support with details about what you were doing.'
    };
  }

  /**
   * Shows user-friendly error messages
   */
  static showErrorMessage(result: EdgeCaseResult): void {
    if (result.message) {
      toast.error(result.message);

      if (result.suggestedAction) {
        console.info('Suggested action:', result.suggestedAction);
      }
    }
  }

  /**
   * Shows user-friendly warning messages
   */
  static showWarningMessage(message: string, suggestion?: string): void {
    toast.warning(message);

    if (suggestion) {
      console.info('Suggestion:', suggestion);
    }
  }

  /**
   * Validates URL format
   */
  private static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sanitizes file names for safe storage
   */
  static sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/[<>:"/\\|?*]/g, '_') // Replace dangerous characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
      .substring(0, 255); // Limit length
  }
}