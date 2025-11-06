import { BaseAgent, AgentCategory, AgentResponse } from "./base-agent";
import { queryClients } from "../tools/query-clients";
import { createClientReport } from "../tools/create-client-report";
import { updateClient } from "../tools/update-client";
import { queryOutstandingBalances } from "../tools/query-outstanding-balances";
import { normalizePhoneNumberForStorage, stripPhoneToComparable } from "../../utils/phone";
import { extractClientNameFromQuery } from "../../utils/client-validation";

interface ParsedClientUpdateSuccess {
  success: true;
  searchQuery: string;
  updateData: Record<string, string | boolean>;
  matchedFields: string[];
}

interface ParsedClientUpdateFailure {
  success: false;
  message: string;
}

type ParsedClientUpdate = ParsedClientUpdateSuccess | ParsedClientUpdateFailure;

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

    const contactKeywords = [
      'contact',
      'contacts',
      'alternate contact',
      'alternative contact',
      'alternative contact 1',
      'alternative contact 2',
      'emergency contact',
      'contact 1',
      'contact 2'
    ];

    const updateVerbs = ['add', 'update', 'change', 'modify', 'edit', 'set', 'correct', 'fix', 'replace'];
    const specificFieldKeywords = ['phone', 'phone number', 'email', 'address', 'relationship', 'notes', 'balance', 'payment'];

    const hasContactKeyword = contactKeywords.some(keyword => lowerQuery.includes(keyword));
    const hasUpdateVerb = updateVerbs.some(verb => lowerQuery.includes(verb));
    const hasFieldKeyword = specificFieldKeywords.some(keyword => lowerQuery.includes(keyword));
    const hasContactUpdate = hasContactKeyword && hasUpdateVerb;

    // Check for specific client operations (enhanced pattern matching)
    const clientOperations = [
      'generate client report', 'create client report', 'client report for',
      'find client by', 'search for client', 'look up client',
      'update client information', 'modify client details',
      'create a report for', 'generate a report for', 'make a report for',
      'report for', 'client report' // More flexible patterns
    ];

    const hasClientOperation = clientOperations.some(operation => lowerQuery.includes(operation));

    return (
      hasClientKeyword ||
      hasClientOperation ||
      hasContactUpdate ||
      (hasUpdateVerb && hasFieldKeyword && (lowerQuery.includes('client') || /\bfor\s+[a-z]/i.test(query)))
    );
  }

  /**
   * Process a client-related query
   */
  public async processQuery(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      const lowerQuery = query.toLowerCase();

      // Determine which tool to use based on the query - prioritized by specificity
      if (this.isReportRequest(query) || lowerQuery.includes('summary') || lowerQuery.includes('profile')) {
        return await this.handleClientReport(query, context);
      } else if (this.isUpdateIntent(lowerQuery)) {
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

      // Use the queryClients tool to get actual client data
      const searchResults = await (queryClients as any)({
        query: searchParams.query,
        limit: searchParams.limit,
        filterByArrested: searchParams.filterByArrested,
        filterByIncarcerated: searchParams.filterByIncarcerated,
        filterByProbation: searchParams.filterByProbation,
        filterByParole: searchParams.filterByParole,
        clientType: searchParams.clientType,
        fuzzyThreshold: searchParams.fuzzyThreshold
      });

      const processingTime = Date.now() - startTime;

      if (searchResults.success && searchResults.results && searchResults.results.length > 0) {
        // Format client data for display with alternative contacts
        const formattedClients = searchResults.results.map((client: any) => {
          const formattedClient: any = {
            id: client.id,
            name: client.name,
            clientType: client.clientType,
            email: client.email,
            phone: client.phone,
            dateOfBirth: client.dateOfBirth,
            address: client.address,
            notes: client.notes,
            county: client.county,
            courtDate: client.courtDate,
            quoted: client.quoted,
            initialPayment: client.initialPayment,
            dueDateBalance: client.dueDateBalance,
            arrested: client.arrested,
            currentlyIncarcerated: client.currentlyIncarcerated,
            onProbation: client.onProbation,
            onParole: client.onParole,
            caseType: client.caseType,
            childrenInvolved: client.childrenInvolved,
            intakeDate: client.intakeDate,
            lastUpdated: client.lastUpdated
          };

          // Add alternative contact information if available
          if (client.contact1 && client.contact1 !== 'Not provided') {
            formattedClient.alternativeContact1 = {
              name: client.contact1,
              relationship: client.relationship1,
              phone: client.contact1Phone
            };
          }

          if (client.contact2 && client.contact2 !== 'Not provided') {
            formattedClient.alternativeContact2 = {
              name: client.contact2,
              relationship: client.relationship2,
              phone: client.contact2Phone
            };
          }

          return formattedClient;
        });

        return {
          success: true,
          message: `Found ${searchResults.results.length} client${searchResults.results.length === 1 ? '' : 's'}`,
          data: {
            clients: formattedClients,
            totalCount: searchResults.totalCount,
            searchMethod: searchResults.searchMethod
          },
          agent: this.name,
          category: this.category,
          metadata: {
            processingTime,
            toolsUsed: ['queryClients'],
            confidence: 0.9
          }
        };
      } else {
        return {
          success: false,
          message: searchResults.message || `No clients found matching "${searchParams.query || 'all clients'}"`,
          agent: this.name,
          category: this.category,
          metadata: {
            processingTime,
            toolsUsed: ['queryClients'],
            confidence: 0.5
          }
        };
      }
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
  private isUpdateIntent(lowerQuery: string): boolean {
    const updateVerbs = ['update', 'modify', 'edit', 'change', 'set', 'add', 'correct', 'fix', 'replace'];
    const fieldKeywords = [
      'phone',
      'phone number',
      'email',
      'address',
      'contact',
      'relationship',
      'notes',
      'county',
      'court date',
      'balance',
      'payment'
    ];

    const hasUpdateVerb = updateVerbs.some(verb => lowerQuery.includes(verb));
    if (!hasUpdateVerb) {
      return false;
    }

    const hasFieldKeyword = fieldKeywords.some(keyword => lowerQuery.includes(keyword));
    const mentionsContact = /\bcontact\s*(?:1|2)\b/.test(lowerQuery) ||
      lowerQuery.includes('alternative contact') ||
      lowerQuery.includes('alternate contact') ||
      lowerQuery.includes('emergency contact');

    return hasFieldKeyword || mentionsContact;
  }

  /**
   * Handle client update queries
   */
  private async handleClientUpdate(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      const parsed = this.parseClientUpdate(query);

      if (!parsed.success) {
        return {
          success: false,
          message: parsed.message,
          agent: this.name,
          category: this.category,
          metadata: {
            processingTime: Date.now() - startTime,
            toolsUsed: [],
            confidence: 0.4
          }
        };
      }

      const { searchQuery, updateData, matchedFields } = parsed;

      const updateResult = await (updateClient as any)({
        searchQuery,
        ...updateData
      });

      const processingTime = Date.now() - startTime;

      if (!updateResult.success) {
        return {
          success: false,
          message: updateResult.message || 'Failed to update client details.',
          agent: this.name,
          category: this.category,
          metadata: {
            processingTime,
            toolsUsed: ['updateClient'],
            confidence: 0.4
          }
        };
      }

      return {
        success: true,
        message: updateResult.message || `Updated ${matchedFields.join(', ')} for ${searchQuery}.`,
        data: updateResult.client,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['updateClient'],
          confidence: 0.9
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
   * Parse client update instructions from a query string
   */
  private parseClientUpdate(query: string): ParsedClientUpdate {
    const potentialName =
      extractClientNameFromQuery(query) ||
      this.extractClientName(query);

    const cleanedName = potentialName ? this.cleanClientName(potentialName) : null;
    const resolvedName = cleanedName ? this.resolveClientName(query, cleanedName) : null;

    if (!resolvedName) {
      return {
        success: false,
        message: "I couldn't tell which client to update. Please mention the client's full name."
      };
    }

    const contactMatch = query.match(/(?:alternate|alternative|emergency)?\s*contact\s*(1|2)/i);
    const contactIndex = contactMatch ? (parseInt(contactMatch[1], 10) === 2 ? 2 : 1) : undefined;

    const updateData: Record<string, string | boolean> = {};
    const matchedFields: string[] = [];

    if (contactIndex) {
      const contactDetails = this.extractContactDetails(query, contactIndex);
      if (contactDetails.name) {
        updateData[`contact_${contactIndex}`] = contactDetails.name;
        matchedFields.push(`contact_${contactIndex}`);
      }
      if (contactDetails.relationship) {
        updateData[`relationship_${contactIndex}`] = contactDetails.relationship;
        matchedFields.push(`relationship_${contactIndex}`);
      }
    }

    const phoneNumber = this.extractPhoneNumber(query);
    if (phoneNumber) {
      if (contactIndex) {
        updateData[`contact_${contactIndex}_phone`] = phoneNumber;
        matchedFields.push(`contact_${contactIndex}_phone`);
      } else {
        updateData.phone = phoneNumber;
        matchedFields.push('phone');
      }
    }

    if (matchedFields.length === 0) {
      return {
        success: false,
        message: "I couldn't detect any specific client fields to update. Please specify the exact detail, like a contact phone number."
      };
    }

    return {
      success: true,
      searchQuery: resolvedName,
      updateData,
      matchedFields
    };
  }

  /**
   * Try to extract and normalize a phone number from the query
   */
  private extractPhoneNumber(query: string): string | null {
    const phoneMatch = query.match(/(\+?\d[\d\s().-]{7,}\d)/);
    if (!phoneMatch) {
      return null;
    }

    const rawPhone = phoneMatch[1].trim();
    const normalized = normalizePhoneNumberForStorage(rawPhone);
    if (normalized) {
      return normalized;
    }

    const stripped = stripPhoneToComparable(rawPhone);
    if (!stripped) {
      return null;
    }

    if (!stripped.startsWith('+') && stripped.length === 10) {
      return `+1${stripped}`;
    }

    return stripped;
  }

  /**
   * Extract contact name and relationship details from the query
   */
  private extractContactDetails(query: string, contactIndex: 1 | 2): { name?: string; relationship?: string } {
    const pattern = new RegExp(`(?:alternate|alternative|emergency)?\\s*contact\\s*${contactIndex}([^\\n]*)`, 'i');
    const match = query.match(pattern);

    if (!match) {
      return {};
    }

    let remainder = match[1] || '';
    const updateVerbMatch = remainder.match(/\b(add|update|change|set|modify|edit|replace|correct|fix)\b/i);
    if (updateVerbMatch && updateVerbMatch.index !== undefined) {
      remainder = remainder.slice(0, updateVerbMatch.index);
    }

    remainder = remainder.replace(/^[:\-,\s]+/, '').trim();
    if (!remainder) {
      return {};
    }

    const relationshipMatch = remainder.match(/\(([^)]+)\)/);
    const relationship = relationshipMatch ? relationshipMatch[1].trim() : undefined;

    let contactName = remainder.replace(/\([^)]*\)/, '').trim();
    contactName = contactName.replace(/[,:;]+$/, '').trim();

    const result: { name?: string; relationship?: string } = {};
    if (contactName) {
      result.name = contactName;
    }
    if (relationship) {
      result.relationship = relationship;
    }

    return result;
  }

  /**
   * Clean up extracted client name fragments from the query
   */
  private cleanClientName(name: string): string {
    if (!name) {
      return '';
    }

    let cleaned = name.trim();
    cleaned = cleaned.replace(/'s\b/i, '').trim();
    cleaned = cleaned.replace(/\b(alternate|alternative|emergency)\s+contact.*$/i, '').trim();
    cleaned = cleaned.replace(/\bcontact\s*(1|2).*/i, '').trim();
    cleaned = cleaned.replace(/[,:;]+$/, '').trim();

    return cleaned;
  }

  /**
   * Resolve client name to include likely surname when only first name is detected
   */
  private resolveClientName(query: string, baseName: string): string | null {
    if (!baseName) {
      return null;
    }

    let resolved = baseName.trim();
    if (!resolved) {
      return null;
    }

    const normalizedQuery = query || '';

    if (!resolved.includes(' ')) {
      const possessivePattern = new RegExp(`\\b${resolved}\\s+([A-Z][a-z]+)'s\\b`, 'i');
      const possessiveMatch = normalizedQuery.match(possessivePattern);
      if (possessiveMatch && possessiveMatch[1]) {
        resolved = `${this.formatNamePart(resolved)} ${this.formatNamePart(possessiveMatch[1])}`;
      } else {
        const surnamePattern = new RegExp(`\\b${resolved}\\s+([A-Z][a-z]+)\\b`, 'i');
        const surnameMatch = normalizedQuery.match(surnamePattern);
        if (surnameMatch && surnameMatch[1]) {
          const candidate = surnameMatch[1];
          const invalidSurnameWords = ['alternative', 'alternate', 'contact', 'client', 'case', 'profile', 'summary', 'report'];
          if (!invalidSurnameWords.includes(candidate.toLowerCase())) {
            resolved = `${this.formatNamePart(resolved)} ${this.formatNamePart(candidate)}`;
          } else {
            resolved = this.formatNamePart(resolved);
          }
        } else {
          resolved = this.formatNamePart(resolved);
        }
      }
    }

    return resolved.trim();
  }

  private formatNamePart(name: string): string {
    if (!name) {
      return '';
    }
    const lower = name.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
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
    const extractedFromUtility = extractClientNameFromQuery(query);
    let fallbackName: string | null = null;

    if (extractedFromUtility) {
      const cleaned = this.cleanClientName(extractedFromUtility);
      const resolved = this.resolveClientName(query, cleaned);
      if (resolved && resolved.includes(' ')) {
        return resolved;
      }
      fallbackName = resolved || cleaned || null;
    }

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
        if (name && !['client', 'case', 'profile', 'summary', 'report', 'this', 'that', 'client'].includes(name.toLowerCase())) {
          const cleanedName = this.cleanClientName(name);
          const resolvedName = this.resolveClientName(query, cleanedName);
          if (resolvedName && resolvedName.includes(' ')) {
            return resolvedName;
          }
          fallbackName = fallbackName ?? resolvedName ?? cleanedName;
        }
      }
    }

    return fallbackName;
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
