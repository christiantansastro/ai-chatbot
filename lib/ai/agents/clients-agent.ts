import type { ClientProfileView } from "@/lib/db/schema";
import { BaseAgent, AgentCategory, AgentResponse } from "./base-agent";
import { runSupabaseSqlTool } from "../tools/run-supabase-sql";
import { getClientProfileTool } from "../tools/get-client-profile";
import { getClientByNameTool } from "../tools/get-client-by-name";
import { listClientsWithOutstandingBalanceTool } from "../tools/list-clients-with-outstanding-balance";
import { createClientReport } from "../tools/create-client-report";
import { updateClient } from "../tools/update-client";
import {
  findClientByName,
  listClientsWithOutstandingBalance,
  type FinancialRecord,
} from "../data/financials";
import { searchClientProfiles } from "../data/clients";

type ClientFinancialSummary = {
  id: string | null;
  name: string;
  totalQuoted: number;
  totalPaid: number;
  outstandingBalance: number;
  lastTransactionDate: string | null;
  primaryCaseNumber: string | null;
  recentTransactions: Array<{
    id: string;
    type: string;
    amount: number;
    transactionDate: string | null;
    paymentMethod: string | null;
    serviceDescription: string | null;
    notes: string | null;
  }>;
};
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
    this.registerTool("run_supabase_sql", runSupabaseSqlTool);
    this.registerTool("get_client_profile", getClientProfileTool);
    this.registerTool("get_client_by_name", getClientByNameTool);
    this.registerTool("list_clients_with_outstanding_balance", listClientsWithOutstandingBalanceTool);
    this.registerTool("createClientReport", createClientReport);
    this.registerTool("updateClient", updateClient);
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
      const searchParams = this.extractSearchParameters(query);

      if (!searchParams.query) {
        return {
          success: false,
          message: "Please provide a client name to search for financial records.",
          agent: this.name,
          category: this.category,
          metadata: {
            processingTime: Date.now() - startTime,
            toolsUsed: ['get_client_by_name'],
            confidence: 0.4
          }
        };
      }

      const [profiles, financialRecords] = await Promise.all([
        searchClientProfiles(searchParams.query, searchParams.limit),
        findClientByName(searchParams.query, searchParams.limit * 3),
      ]);

      const financialSummaries = this.aggregateClientRecords(financialRecords);
      const summaryMap = new Map(
        financialSummaries.map((summary) => [
          summary.name.toLowerCase(),
          summary,
        ])
      );

      const processingTime = Date.now() - startTime;

      if (profiles.length > 0) {
        const formattedProfiles = profiles.map((profile) =>
          this.formatClientProfile(
            profile,
            summaryMap.get((profile.client_name || "").toLowerCase())
          )
        );

        return {
          success: true,
          message: `Found ${formattedProfiles.length} client${formattedProfiles.length === 1 ? '' : 's'} matching "${searchParams.query}"`,
          data: {
            clients: formattedProfiles,
            totalCount: formattedProfiles.length,
            searchQuery: searchParams.query,
          },
          agent: this.name,
          category: this.category,
          metadata: {
            processingTime,
            toolsUsed: ['get_client_profile', 'get_client_by_name'],
            confidence: 0.9,
          },
        };
      }

      if (financialSummaries.length > 0) {
        return {
          success: true,
          message: `No direct profile match, but found ${financialSummaries.length} client${financialSummaries.length === 1 ? '' : 's'} with related financial history.`,
          data: {
            clients: financialSummaries,
            totalCount: financialSummaries.length,
            searchQuery: searchParams.query,
          },
          agent: this.name,
          category: this.category,
          metadata: {
            processingTime,
            toolsUsed: ['get_client_by_name'],
            confidence: 0.7,
          },
        };
      }

      return {
        success: false,
        message: `No client records found for "${searchParams.query}".`,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['get_client_profile', 'get_client_by_name'],
          confidence: 0.4,
        },
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
          toolsUsed: ['get_client_profile', 'get_client_by_name'],
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
      const clients = await listClientsWithOutstandingBalance(0, 50);
      const message =
        clients.length > 0
          ? `Found ${clients.length} client${clients.length === 1 ? '' : 's'} with outstanding balances.`
          : "No clients currently have outstanding balances above $0.";

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        message,
        data: clients,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['list_clients_with_outstanding_balance'],
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
          toolsUsed: ['list_clients_with_outstanding_balance'],
          confidence: 0
        }
      };
    }
  }

  private aggregateClientRecords(records: FinancialRecord[]): ClientFinancialSummary[] {
    const summaries = new Map<string, {
      clientName: string;
      clientId: string | null;
      totalQuoted: number;
      totalPaid: number;
      transactions: Array<{
        id: string;
        type: string;
        amount: number;
        transactionDate: string | null;
        paymentMethod: string | null;
        serviceDescription: string | null;
        notes: string | null;
      }>;
      latestTransactionDate: string | null;
      primaryCaseNumber: string | null;
    }>();

    for (const record of records) {
      const clientName = (record.client_name || "Unknown client").trim() || "Unknown client";
      const summary =
        summaries.get(clientName) ??
        {
          clientName,
          clientId: record.client_id || null,
          totalQuoted: 0,
          totalPaid: 0,
          transactions: [],
          latestTransactionDate: null,
          primaryCaseNumber: null,
        };

      const amount = Number(record.amount) || 0;
      if (record.transaction_type === "quote") {
        summary.totalQuoted += amount;
      } else if (record.transaction_type === "payment" || record.transaction_type === "adjustment") {
        summary.totalPaid += amount;
      }

      summary.transactions.push({
        id: record.id,
        type: record.transaction_type,
        amount,
        transactionDate: record.transaction_date,
        paymentMethod: record.payment_method,
        serviceDescription: record.service_description,
        notes: record.notes,
      });

      summary.latestTransactionDate = this.pickLatestDate(
        summary.latestTransactionDate,
        record.transaction_date
      );

      if (!summary.primaryCaseNumber && record.case_number) {
        summary.primaryCaseNumber = record.case_number;
      }

      summaries.set(clientName, summary);
    }

    return Array.from(summaries.values()).map((summary) => ({
      id: summary.clientId,
      name: summary.clientName,
      totalQuoted: Number(summary.totalQuoted.toFixed(2)),
      totalPaid: Number(summary.totalPaid.toFixed(2)),
      outstandingBalance: Number((summary.totalQuoted - summary.totalPaid).toFixed(2)),
      lastTransactionDate: summary.latestTransactionDate,
      primaryCaseNumber: summary.primaryCaseNumber,
      recentTransactions: summary.transactions.slice(0, 5),
    }));
  }

  private formatClientProfile(
    profile: ClientProfileView,
    financialSummary?: ClientFinancialSummary
  ) {
    const alternativeContact1 = profile.contact_1
      ? {
          name: profile.contact_1,
          relationship: profile.relationship_1 || "Not provided",
          phone: profile.contact_1_phone || "Not provided",
        }
      : undefined;

    const alternativeContact2 = profile.contact_2
      ? {
          name: profile.contact_2,
          relationship: profile.relationship_2 || "Not provided",
          phone: profile.contact_2_phone || "Not provided",
        }
      : undefined;

    return {
      id: profile.id,
      name: profile.client_name,
      clientType: profile.client_type || "Unspecified",
      email: profile.email || "Not provided",
      phone: profile.phone || "Not provided",
      address: profile.address || "Not provided",
      notes: profile.notes || "No notes on file",
      county: profile.county || "Not provided",
      courtDate: profile.court_date
        ? new Date(profile.court_date).toLocaleDateString()
        : "Not provided",
      quoted: profile.quoted || "Not provided",
      initialPayment: profile.initial_payment || "Not provided",
      dueDateBalance: profile.due_date_balance
        ? new Date(profile.due_date_balance).toLocaleDateString()
        : "Not provided",
      arrested: this.formatBoolean(profile.arrested),
      currentlyIncarcerated: this.formatBoolean(profile.currently_incarcerated),
      incarcerationLocation: profile.incarceration_location || "Not provided",
      onProbation: this.formatBoolean(profile.on_probation),
      onParole: this.formatBoolean(profile.on_parole),
      caseType: profile.case_type || "Not provided",
      childrenInvolved: this.formatBoolean(profile.children_involved),
      alternativeContact1,
      alternativeContact2,
      financialSummary: financialSummary
        ? {
            totalQuoted: financialSummary.totalQuoted,
            totalPaid: financialSummary.totalPaid,
            outstandingBalance: financialSummary.outstandingBalance,
            lastTransactionDate: financialSummary.lastTransactionDate,
            recentTransactions: financialSummary.recentTransactions,
          }
        : undefined,
    };
  }

  private formatBoolean(value: boolean | null | undefined) {
    if (value === null || value === undefined) {
      return "Not specified";
    }
    return value ? "Yes" : "No";
  }

  private pickLatestDate(current: string | null, candidate: string | null): string | null {
    if (!candidate) {
      return current;
    }

    if (!current) {
      return candidate;
    }

    const currentDate = new Date(current);
    const candidateDate = new Date(candidate);

    return candidateDate > currentDate ? candidate : current;
  }

  /**
   * Extract search parameters from a query string
   */
  private extractSearchParameters(query: string): { query: string | null; limit: number } {
    const extracted = this.extractClientName(query);
    const fallbackQuery = extracted || query.trim() || null;

    return {
      query: fallbackQuery,
      limit: 10,
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
