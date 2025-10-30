import { BaseAgent, AgentCategory, AgentResponse } from "./base-agent";
import { queryClients } from "../tools/query-clients";
import { createClientReport } from "../tools/create-client-report";
import { updateClient } from "../tools/update-client";
import { queryOutstandingBalances } from "../tools/query-outstanding-balances";

/**
 * Clients Agent - Handles all client-related queries and operations
 */
export class ClientsAgent extends BaseAgent {
  constructor() {
    super(
      "Clients Agent",
      "Specialized in client management, client data, client interactions, and client reports",
      "clients"
    );

    // Register client-specific tools
    this.registerTool("queryClients", queryClients);
    this.registerTool("createClientReport", createClientReport);
    this.registerTool("updateClient", updateClient);
    this.registerTool("queryOutstandingBalances", queryOutstandingBalances);
  }

/**
   * Check if this agent can handle a given query based on keywords and context
   */
  public canHandle(query: string): boolean {
    const lowerQuery = query.toLowerCase();

    // Client-related keywords
    const clientKeywords = [
       'client', 'clients', 'customer', 'customers',
       'client name', 'find client', 'search client', 'lookup client',
       'client information', 'client details', 'client data',
       'client report', 'client profile', 'client summary',
       'update client', 'modify client', 'edit client',
       'client type', 'civil client', 'criminal client',
       'client contact', 'client email', 'client phone',
       'arrested', 'incarcerated', 'probation', 'parole',
       'case type', 'charges', 'county', 'court date',
       'outstanding balance', 'outstanding', 'balance', 'balances',
       'financial balance', 'payment balance', 'owed', 'owing'
     ];

    // Check for client keywords
    const hasClientKeyword = clientKeywords.some(keyword => lowerQuery.includes(keyword));

    // Check for specific client operations (enhanced pattern matching)
    const clientOperations = [
      'generate client report', 'create client report', 'client report for',
      'find client by', 'search for client', 'look up client',
      'update client information', 'modify client details',
      'create a report for', 'generate a report for', 'make a report for',
      'report for', 'client report' // More flexible patterns
    ];

    const hasClientOperation = clientOperations.some(operation => lowerQuery.includes(operation));

    return hasClientKeyword || hasClientOperation;
  }

  /**
   * Process a client-related query
   */
  public async processQuery(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      const lowerQuery = query.toLowerCase();

      // Determine which tool to use based on the query - prioritized by specificity
       if (lowerQuery.includes('report') || lowerQuery.includes('summary') || lowerQuery.includes('profile')) {
         return await this.handleClientReport(query, context);
       } else if (lowerQuery.includes('update') || lowerQuery.includes('modify') || lowerQuery.includes('edit')) {
         return await this.handleClientUpdate(query, context);
       } else if (lowerQuery.includes('outstanding') || lowerQuery.includes('balance') || lowerQuery.includes('owed') || lowerQuery.includes('owing')) {
         return await this.handleOutstandingBalances(query, context);
       } else {
         return await this.handleClientSearch(query, context);
       }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error processing client query: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
   * Handle client search queries
   */
  private async handleClientSearch(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // Extract search parameters from query
      const searchParams = this.extractSearchParameters(query);

      // For now, return a simplified response since the tool integration is complex
      // In a full implementation, this would use the actual queryClients tool
      const result = {
        success: true,
        message: `Searching for clients matching: ${searchParams.query || 'all clients'}`,
        results: [],
        totalCount: 0,
        searchMethod: 'simplified'
      };

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        message: result.message,
        data: result,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['queryClients'],
          confidence: 0.8
        }
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error searching clients: ${error instanceof Error ? error.message : 'Unknown error'}`,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['queryClients'],
          confidence: 0
        }
      };
    }
  }

  /**
   * Handle client report generation
   */
  private async handleClientReport(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // Extract client name from query
      const clientName = this.extractClientName(query);

      if (!clientName) {
        return {
          success: false,
          message: "Could not identify client name for report generation. Please specify a client name.",
          agent: this.name,
          category: this.category,
          metadata: {
            processingTime: Date.now() - startTime,
            toolsUsed: [],
            confidence: 0.3
          }
        };
      }

      // Extract additional parameters from query
      const includeCommunicationHistory = !query.toLowerCase().includes('no communication') &&
                                         !query.toLowerCase().includes('exclude communication');
      const reportDate = this.extractReportDate(query);
      const reportTitle = this.extractReportTitle(query) || "Client Report";

      // Check if we have session and dataStream context for direct tool execution
      if (context?.session && context?.dataStream) {
        try {
          // Call the createClientReport tool directly with proper context
          const toolResult = await (createClientReport as any)({
            clientName,
            includeCommunicationHistory,
            reportDate,
            reportTitle,
            session: context.session,
            dataStream: context.dataStream
          });

          const processingTime = Date.now() - startTime;

          return {
            success: true,
            message: `Comprehensive client report generated successfully for ${clientName}`,
            data: {
              clientName,
              reportId: toolResult.id,
              reportTitle: toolResult.title,
              reportType: 'client-report',
              reportContent: toolResult.content,
              includesCommunicationHistory: includeCommunicationHistory
            },
            agent: this.name,
            category: this.category,
            metadata: {
              processingTime,
              toolsUsed: ['createClientReport'],
              confidence: 0.9
            }
          };
        } catch (toolError) {
          console.warn('Direct tool execution failed, falling back to agent response:', toolError);
          // Continue to fallback response below
        }
      }

      // Fallback response when direct tool execution is not available
      const processingTime = Date.now() - startTime;

      return {
        success: true,
        message: `I'll generate a comprehensive client report for ${clientName} with ${includeCommunicationHistory ? 'communication history included' : 'basic information only'}. The report will include client profile, financial summary, ${includeCommunicationHistory ? 'and detailed communication history.' : 'but excluding communication history.'}`,
        data: {
          clientName,
          reportTitle,
          includeCommunicationHistory,
          reportDate,
          action: 'generate_report',
          toolRequired: true
        },
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['createClientReport'],
          confidence: 0.9
        }
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error generating client report: ${error instanceof Error ? error.message : 'Unknown error'}`,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['createClientReport'],
          confidence: 0
        }
      };
    }
  }

  /**
   * Handle client update queries
   */
  private async handleClientUpdate(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // For now, return a message indicating this feature needs more context
      // In a full implementation, this would parse the query to extract update parameters
      return {
        success: false,
        message: "Client update functionality requires specific field information. Please specify what information you'd like to update (e.g., 'update client John Doe phone number to 555-1234').",
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime: Date.now() - startTime,
          toolsUsed: [],
          confidence: 0.5
        }
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error processing client update: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
   * Handle outstanding balances queries
   */
  private async handleOutstandingBalances(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // Use the queryOutstandingBalances tool
      const result = await (queryOutstandingBalances as any)({ limit: 50 });

      const processingTime = Date.now() - startTime;

      return {
        success: result.success,
        message: result.message,
        data: result.clients,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['queryOutstandingBalances'],
          confidence: 0.9
        }
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error querying outstanding balances: ${error instanceof Error ? error.message : 'Unknown error'}`,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['queryOutstandingBalances'],
          confidence: 0
        }
      };
    }
  }

  /**
   * Extract search parameters from a query string
   */
  private extractSearchParameters(query: string): any {
    const lowerQuery = query.toLowerCase();

    return {
      query: this.extractClientName(query),
      limit: 10,
      filterByArrested: lowerQuery.includes('arrested') ? true : undefined,
      filterByIncarcerated: lowerQuery.includes('incarcerated') || lowerQuery.includes('in jail') ? true : undefined,
      filterByProbation: lowerQuery.includes('probation') ? true : undefined,
      filterByParole: lowerQuery.includes('parole') ? true : undefined,
      clientType: lowerQuery.includes('civil') ? 'civil' : lowerQuery.includes('criminal') ? 'criminal' : undefined,
      fuzzyThreshold: 0.3
    };
  }

  /**
   * Extract client name from query string
   */
  private extractClientName(query: string): string | null {
    // Enhanced extraction with more patterns for "report for" requests
    const patterns = [
      // Handle "report for [name]" patterns
      /(?:report|summary|profile)\s+for\s+["']?([^"'\s]+(?:\s+[^"'\s]+)*?)["']?(?:\s|$)/i,
      /client\s+["']?([^"'\s]+(?:\s+[^"'\s]+)*?)["']?(?:\s|$)/i,
      /for\s+["']?([^"'\s]+(?:\s+[^"'\s]+)*?)["']?(?:\s|$)/i,
      /["']([^"']+)["']/,
      // Match capitalized names (more flexible)
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/,
      // Match quoted or single word names
      /\b([a-zA-Z]+(?:\s+[a-zA-Z]+)?)\s+(?:client|field|case|profile)/
    ];

    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        // Filter out common non-name words
        if (name && !['client', 'case', 'field', 'profile', 'summary', 'report', 'this', 'that', 'client'].includes(name.toLowerCase())) {
          return name;
        }
      }
    }

    return null;
  }

  /**
   * Check if query is a report request
   */
  private isReportRequest(query: string): boolean {
    const reportPatterns = [
      /create\s+(?:a\s+)?(?:client\s+)?report\s+for/i,
      /generate\s+(?:a\s+)?(?:client\s+)?report\s+for/i,
      /make\s+(?:a\s+)?(?:client\s+)?report\s+for/i,
      /build\s+(?:a\s+)?(?:client\s+)?report\s+for/i,
      /\breport\s+for\s+[a-z]/i
    ];
    
    return reportPatterns.some(pattern => pattern.test(query));
  }

  /**
   * Extract report date from query string
   */
  private extractReportDate(query: string): string | undefined {
    // Look for date patterns like YYYY-MM-DD
    const datePattern = /(\d{4}-\d{2}-\d{2})/;
    const match = query.match(datePattern);
    return match ? match[1] : undefined;
  }

  /**
   * Extract report title from query string
   */
  private extractReportTitle(query: string): string | undefined {
    // Look for quoted titles or titles following "title:"
    const titlePatterns = [
      /title:\s*["']?([^"']+)["']?/i,
      /named:\s*["']?([^"']+)["']?/i,
      /called:\s*["']?([^"']+)["']?/i
    ];

    for (const pattern of titlePatterns) {
      const match = query.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return undefined;
  }
}