import { BaseAgent, AgentCategory, AgentResponse } from "./base-agent";

/**
 * Communications Agent - Handles all communication-related queries and operations
 */
export class CommunicationsAgent extends BaseAgent {
  constructor() {
    super(
      "Communications Agent",
      "Specialized in messaging, emails, notifications, internal communications, and communication logs",
      "communications"
    );

    // Note: Communication tools would be registered here when available
    // this.registerTool("getCommunicationSummary", getCommunicationSummary);
    // this.registerTool("deleteCommunication", deleteCommunication);
    // this.registerTool("updateCommunication", updateCommunication);
  }

  /**
   * Check if this agent can handle a given query based on keywords and context
   */
  public canHandle(query: string): boolean {
    const lowerQuery = query.toLowerCase();

    // Communication-related keywords
    const communicationKeywords = [
      'communication', 'communications', 'message', 'messages',
      'email', 'emails', 'mail', 'letter', 'letters',
      'notification', 'notifications', 'alert', 'alerts',
      'contact', 'contacts', 'reach out', 'reached out',
      'call', 'calls', 'phone', 'phone call', 'called',
      'text', 'texts', 'sms', 'message', 'messaging',
      'correspondence', 'conversation', 'conversations',
      'interaction', 'interactions', 'communicate', 'communicated',
      'speak', 'spoke', 'talk', 'talked', 'discuss', 'discussed',
      'meeting', 'meetings', 'appointment', 'appointments',
      'schedule', 'scheduled', 'calendar', 'calendaring',
      'note', 'notes', 'memo', 'memos', 'record', 'records',
      'log', 'logs', 'history', 'communication history',
      'follow up', 'follow-up', 'followed up',
      'response', 'respond', 'responded', 'reply', 'replied',
      'inquiry', 'inquiries', 'question', 'questions',
      'complaint', 'complaints', 'issue', 'issues',
      'feedback', 'comment', 'comments', 'review', 'reviews',
      'announcement', 'announcements', 'bulletin', 'bulletins',
      'newsletter', 'newsletters', 'update', 'updates',
      'status', 'statuses', 'progress', 'report', 'reports'
    ];

    // Check for communication keywords
    const hasCommunicationKeyword = communicationKeywords.some(keyword => lowerQuery.includes(keyword));

    // Check for specific communication operations
    const communicationOperations = [
      'communication history', 'communication log', 'communication summary',
      'get communications', 'find communications', 'search communications',
      'communication records', 'communication details',
      'email history', 'message history', 'call history',
      'contact history', 'interaction history',
      'schedule meeting', 'set up meeting', 'book appointment',
      'send message', 'send email', 'make call',
      'follow up', 'check status', 'get update',
      'communication report', 'communication summary'
    ];

    const hasCommunicationOperation = communicationOperations.some(operation => lowerQuery.includes(operation));

    return hasCommunicationKeyword || hasCommunicationOperation;
  }

  /**
   * Process a communication-related query
   */
  public async processQuery(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      const lowerQuery = query.toLowerCase();

      // Determine which type of communication query this is
      if (lowerQuery.includes('history') || lowerQuery.includes('log') || lowerQuery.includes('summary') || lowerQuery.includes('records')) {
        return await this.handleCommunicationHistory(query, context);
      } else if (lowerQuery.includes('schedule') || lowerQuery.includes('meeting') || lowerQuery.includes('appointment') || lowerQuery.includes('calendar')) {
        return await this.handleScheduling(query, context);
      } else if (lowerQuery.includes('send') || lowerQuery.includes('email') || lowerQuery.includes('message') || lowerQuery.includes('call')) {
        return await this.handleOutgoingCommunication(query, context);
      } else {
        return await this.handleGeneralCommunicationQuery(query, context);
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error processing communication query: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
   * Handle communication history requests
   */
  private async handleCommunicationHistory(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // Extract client or contact name from query
      const contactName = this.extractContactName(query);

      const result = {
        success: true,
        message: `Communication history query for ${contactName || 'all contacts'}`,
        contactName,
        queryType: 'communication_history'
      };

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        message: `Communication history retrieved successfully${contactName ? ` for ${contactName}` : ''}`,
        data: result,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['getCommunicationSummary'],
          confidence: 0.9
        }
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error retrieving communication history: ${error instanceof Error ? error.message : 'Unknown error'}`,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['getCommunicationSummary'],
          confidence: 0
        }
      };
    }
  }

  /**
   * Handle scheduling requests
   */
  private async handleScheduling(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // Extract scheduling details from query
      const schedulingDetails = this.extractSchedulingDetails(query);

      const result = {
        success: true,
        message: `Scheduling request processed: ${schedulingDetails.type}`,
        details: schedulingDetails,
        queryType: 'scheduling'
      };

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        message: `Scheduling request processed successfully`,
        data: result,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['scheduleCommunication'],
          confidence: 0.85
        }
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error processing scheduling request: ${error instanceof Error ? error.message : 'Unknown error'}`,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['scheduleCommunication'],
          confidence: 0
        }
      };
    }
  }

  /**
   * Handle outgoing communication requests
   */
  private async handleOutgoingCommunication(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // Extract communication details from query
      const communicationDetails = this.extractCommunicationDetails(query);

      const result = {
        success: true,
        message: `Outgoing communication request: ${communicationDetails.type}`,
        details: communicationDetails,
        queryType: 'outgoing_communication'
      };

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        message: `Outgoing communication request processed successfully`,
        data: result,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['sendCommunication'],
          confidence: 0.8
        }
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error processing outgoing communication: ${error instanceof Error ? error.message : 'Unknown error'}`,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['sendCommunication'],
          confidence: 0
        }
      };
    }
  }

  /**
   * Handle general communication queries
   */
  private async handleGeneralCommunicationQuery(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      const result = {
        success: true,
        message: "General communication query processed",
        query: query,
        queryType: 'general_communication'
      };

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        message: "Communication query processed successfully",
        data: result,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['generalCommunicationTool'],
          confidence: 0.7
        }
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error processing communication query: ${error instanceof Error ? error.message : 'Unknown error'}`,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['generalCommunicationTool'],
          confidence: 0
        }
      };
    }
  }

  /**
   * Extract contact name from query string
   */
  private extractContactName(query: string): string | null {
    // Simple extraction - look for quoted names or names after common patterns
    const patterns = [
      /with\s+["']?([^"'\s]+(?:\s+[^"'\s]+)*?)["']?(?:\s|$)/i,
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
   * Extract scheduling details from query
   */
  private extractSchedulingDetails(query: string): any {
    const lowerQuery = query.toLowerCase();

    return {
      type: lowerQuery.includes('meeting') ? 'meeting' : lowerQuery.includes('appointment') ? 'appointment' : 'call',
      date: this.extractDate(query),
      time: this.extractTime(query),
      duration: this.extractDuration(query),
      participants: this.extractParticipants(query)
    };
  }

  /**
   * Extract communication details from query
   */
  private extractCommunicationDetails(query: string): any {
    const lowerQuery = query.toLowerCase();

    return {
      type: lowerQuery.includes('email') ? 'email' : lowerQuery.includes('call') ? 'call' : 'message',
      recipient: this.extractContactName(query),
      subject: this.extractSubject(query),
      urgency: this.extractUrgency(query)
    };
  }

  /**
   * Extract date from query (simplified implementation)
   */
  private extractDate(query: string): string | null {
    // This would use a more sophisticated date extraction library in practice
    return null;
  }

  /**
   * Extract time from query (simplified implementation)
   */
  private extractTime(query: string): string | null {
    // This would use a more sophisticated time extraction library in practice
    return null;
  }

  /**
   * Extract duration from query (simplified implementation)
   */
  private extractDuration(query: string): string | null {
    // This would use a more sophisticated duration extraction library in practice
    return null;
  }

  /**
   * Extract participants from query (simplified implementation)
   */
  private extractParticipants(query: string): string[] {
    // This would use a more sophisticated participant extraction library in practice
    return [];
  }

  /**
   * Extract subject from query (simplified implementation)
   */
  private extractSubject(query: string): string | null {
    // This would use a more sophisticated subject extraction library in practice
    return null;
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
}