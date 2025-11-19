import type { ClientProfileView } from "@/lib/db/schema";
import { BaseAgent, AgentCategory, AgentResponse } from "./base-agent";
import { runSupabaseSqlTool } from "../tools/run-supabase-sql";
import { getClientProfileTool } from "../tools/get-client-profile";
import { getClientByNameTool } from "../tools/get-client-by-name";
import { createClientReport } from "../tools/create-client-report";
import { updateClient } from "../tools/update-client";
import { queryClientDataTool } from "../tools/query-client-data";
import {
  executeClientDataQuery,
  type ClientDataQueryRequest,
  type ClientDataQueryRow,
} from "../data/client-data-query";
import { findClientByName, type FinancialRecord } from "../data/financials";
import { searchClientProfiles } from "../data/clients";
import { runSupabaseSql } from "../data/db";

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

type ClientDataSelections = NonNullable<ClientDataQueryRequest["select"]>;
type ClientDataFilters = NonNullable<ClientDataQueryRequest["filters"]>;
type ClientDataAggregates = NonNullable<ClientDataQueryRequest["aggregates"]>;
type ClientDataSorts = NonNullable<ClientDataQueryRequest["orderBy"]>;

type AnalyticsStrategy = 'structured_query' | 'direct_client_type_counts';

interface ClientTypeCountIntent {
  includeCivil: boolean;
  includeCriminal: boolean;
}

interface ClientAnalyticsPlan {
  strategy: AnalyticsStrategy;
  request: ClientDataQueryRequest;
  countAlias: string;
  groupKeys: string[];
  outstandingAlias?: string;
}

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
    this.registerTool("query_client_data", queryClientDataTool);
    this.registerTool("get_client_profile", getClientProfileTool);
    this.registerTool("get_client_by_name", getClientByNameTool);
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
      } else if (this.isGeneralClientListIntent(lowerQuery)) {
        return await this.handleGeneralClientList(query, context);
      }

      const typeCountIntent = this.detectClientTypeCountIntent(lowerQuery);
      if (typeCountIntent) {
        return await this.handleClientTypeCount(query, typeCountIntent);
      }

      if (this.isAnalyticsIntent(lowerQuery)) {
        return await this.handleClientAnalytics(query, context);
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

  private async handleGeneralClientList(query: string, _context?: any): Promise<AgentResponse> {
    const startTime = Date.now();
    const clientLimit = 30;

    try {
      const rows = await runSupabaseSql<{ id: string; client_name: string | null; client_type: string | null }>(
        `
          SELECT id, client_name, client_type
          FROM client_profiles
          WHERE client_name IS NOT NULL
          ORDER BY client_name ASC
        `,
        clientLimit
      );

      if (!rows.length) {
        return {
          success: false,
          message: "No clients were found in the directory.",
          agent: this.name,
          category: this.category,
          metadata: {
            processingTime: Date.now() - startTime,
            toolsUsed: ['runSupabaseSql'],
            confidence: 0.4,
          },
        };
      }

      const segments = rows.map((row, index) => {
        const name = (row.client_name ?? "").trim() || "Unnamed client";
        const typeLabel = row.client_type ? ` (${this.formatClientTypeLabel(row.client_type)})` : "";
        return `${index + 1}. ${name}${typeLabel}`;
      });

      const header = `Listing ${rows.length} client${rows.length === 1 ? '' : 's'}${rows.length === clientLimit ? ` (showing the first ${clientLimit})` : ''}:`;

      return {
        success: true,
        message: `${header}\n${segments.join('\n')}`,
        data: {
          clients: rows,
          limit: clientLimit,
        },
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime: Date.now() - startTime,
          toolsUsed: ['runSupabaseSql'],
          confidence: 0.8,
        },
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error listing clients: ${error instanceof Error ? error.message : 'Unknown error'}`,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['runSupabaseSql'],
          confidence: 0.2,
        },
      };
    }
  }

  /**
   * Handle aggregate or analytics-style queries
   */
  private async handleClientAnalytics(query: string, _context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      const plan = this.buildAnalyticsPlan(query);
      let rows: ClientDataQueryRow[] = [];
      let sqlUsed = '';

      if (plan.strategy === 'direct_client_type_counts') {
        const directCounts = await this.fetchDirectClientTypeCounts(plan.countAlias);
        if (directCounts && directCounts.rows.length) {
          rows = directCounts.rows;
          sqlUsed = directCounts.sql;
        }
      }

      if (!rows.length) {
        const result = await executeClientDataQuery(plan.request);
        rows = result.rows;
        sqlUsed = result.plan.sql;

        if (!rows.length && this.shouldFallbackToClientTypeCounts(plan)) {
          const fallback = await this.fetchClientTypeCountsFallback(plan.countAlias);
          if (fallback.rows.length) {
            rows = fallback.rows;
            sqlUsed = fallback.sql;
          } else if (plan.strategy !== 'direct_client_type_counts') {
            const directCounts = await this.fetchDirectClientTypeCounts(plan.countAlias);
            if (directCounts && directCounts.rows.length) {
              rows = directCounts.rows;
              sqlUsed = directCounts.sql;
            }
          }
        }
      }

      const prefersBrief = this.prefersBriefAnalyticsResponse(query);
      const message = this.formatAnalyticsMessage(rows, plan, prefersBrief);

      const toolsUsed: string[] = [];
      if (sqlUsed === 'supabase_js:client_type_counts') {
        toolsUsed.push('clients_table_counts');
      }
      if (!toolsUsed.length) {
        toolsUsed.push('query_client_data');
      }

      return {
        success: true,
        message,
        data: {
          rows,
          sql: sqlUsed,
          request: plan.request,
        },
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime: Date.now() - startTime,
          toolsUsed,
          confidence: 0.9,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to run client analytics: ${error instanceof Error ? error.message : 'Unknown error'}`,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime: Date.now() - startTime,
          toolsUsed: ['query_client_data'],
          confidence: 0.2,
        },
      };
    }
  }

  private isAnalyticsIntent(lowerQuery: string): boolean {
    const countKeywords = ['how many', 'number of', 'count', 'total'];
    const analyticsKeywords = ['breakdown', 'distribution', 'by county', 'by type', 'top', 'average', 'avg', 'sum'];
    const mentionsClients = lowerQuery.includes('client');
    const mentionsGrouping =
      lowerQuery.includes('civil') ||
      lowerQuery.includes('criminal') ||
      lowerQuery.includes('county') ||
      lowerQuery.includes('case type') ||
      lowerQuery.includes('case-type');

    const hasCountKeyword = countKeywords.some((keyword) => lowerQuery.includes(keyword));
    const hasAnalyticsKeyword = analyticsKeywords.some((keyword) => lowerQuery.includes(keyword));

    return (hasCountKeyword && (mentionsClients || mentionsGrouping)) || (hasAnalyticsKeyword && (mentionsClients || mentionsGrouping));
  }

  private isGeneralClientListIntent(lowerQuery: string): boolean {
    if (!lowerQuery.includes('client')) {
      return false;
    }

    const listPatterns = [
      /\b(list|show|display|give me|provide|what|who)\b.*\bclients?\b/,
      /\ball clients?\b/,
      /\bclients?\b.*\blist\b/,
    ];

    if (!listPatterns.some((pattern) => pattern.test(lowerQuery))) {
      return false;
    }

    const filterKeywords = [
      'outstanding',
      'balance',
      'due',
      'payment',
      'county',
      'civil',
      'criminal',
      'type',
      'case',
      'status',
      'overdue',
      'collection',
      'owed',
      'owing',
      'report',
      'profile',
      'summary',
      'analytics',
      'analysis',
      'breakdown',
      'distribution',
    ];

    if (filterKeywords.some((keyword) => lowerQuery.includes(keyword))) {
      return false;
    }

    return true;
  }


  private detectClientTypeCountIntent(lowerQuery: string): ClientTypeCountIntent | null {
    const countKeywords = ['how many', 'number of', 'count', 'total'];
    const triggersCount = countKeywords.some((keyword) => lowerQuery.includes(keyword));
    const mentionsClients = lowerQuery.includes('client');
    const mentionsCivil = lowerQuery.includes('civil');
    const mentionsCriminal = lowerQuery.includes('criminal');
    const mentionsClientType = lowerQuery.includes('client_type');

    if (!(triggersCount && mentionsClients)) {
      return null;
    }

    if (!mentionsCivil && !mentionsCriminal && !mentionsClientType) {
      return null;
    }

    return {
      includeCivil: mentionsCivil || !mentionsCriminal,
      includeCriminal: mentionsCriminal || !mentionsCivil,
    };
  }

  private async handleClientTypeCount(query: string, intent: ClientTypeCountIntent): Promise<AgentResponse> {
    const startTime = Date.now();
    const counts = await this.fetchDirectClientTypeCounts('client_count');

    if (!counts || counts.rows.length === 0) {
      return {
        success: false,
        message: 'No client records found.',
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime: Date.now() - startTime,
          toolsUsed: ['clients_table_counts'],
          confidence: 0.2,
        },
      };
    }

    const alias = 'client_count';
    const parts: string[] = [];
    let total = 0;

    for (const row of counts.rows) {
      const type = typeof row.client_type === 'string' ? row.client_type.toLowerCase() : '';
      const value = this.ensureNumber(row[alias]);

      if (type === 'civil' && intent.includeCivil) {
        parts.push(`Civil: ${value}`);
      } else if (type === 'criminal' && intent.includeCriminal) {
        parts.push(`Criminal: ${value}`);
      }

      total += value;
    }

    if (parts.length === 0) {
      return {
        success: true,
        message: 'No matching client records found.',
        data: { rows: counts.rows, sql: counts.sql },
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime: Date.now() - startTime,
          toolsUsed: ['clients_table_counts'],
          confidence: 0.5,
        },
      };
    }

    const message = `${parts.join(', ')} (Total: ${total})`;

    return {
      success: true,
      message,
      data: {
        rows: counts.rows,
        sql: counts.sql,
        query,
      },
      agent: this.name,
      category: this.category,
      metadata: {
        processingTime: Date.now() - startTime,
        toolsUsed: ['clients_table_counts'],
        confidence: 0.95,
      },
    };
  }

  private buildAnalyticsPlan(query: string): ClientAnalyticsPlan {
    const lowerQuery = query.toLowerCase();
    const select: ClientDataSelections = [];
    const filters: ClientDataFilters = [];
    const groupBy: string[] = [];
    const orderBy: ClientDataSorts = [];
    const aggregates: ClientDataAggregates = [];

    const ensureSelectField = (field: string) => {
      if (!select.some((entry) => (typeof entry === 'string' ? entry : entry.field) === field)) {
        select.push(field);
      }
    };

    const ensureGroupField = (field: string) => {
      if (!groupBy.includes(field)) {
        groupBy.push(field);
        ensureSelectField(field);
      }
    };

    const mentionsCivil = lowerQuery.includes('civil');
    const mentionsCriminal = lowerQuery.includes('criminal');

    if (mentionsCivil && mentionsCriminal) {
      ensureGroupField('client_type');
    } else if (mentionsCivil || mentionsCriminal) {
      filters.push({
        field: 'client_type',
        operator: 'eq',
        value: mentionsCivil ? 'civil' : 'criminal',
      });
    }

    if (lowerQuery.includes('county')) {
      ensureGroupField('county');
    }

    if (lowerQuery.includes('case type') || lowerQuery.includes('case-type') || lowerQuery.includes('case types')) {
      ensureGroupField('case_type');
    }

    const outstandingThreshold = this.extractOutstandingBalanceFilter(query);
    if (outstandingThreshold) {
      filters.push({
        field: 'outstanding_balance',
        operator: outstandingThreshold.operator,
        value: outstandingThreshold.value,
      });
    }

    const hasGroupings = groupBy.length > 0;
    const hasExplicitSelect = select.length > 0;
    const countAlias = hasGroupings || hasExplicitSelect ? 'client_count' : 'total_clients';
    aggregates.push({
      func: 'count',
      alias: countAlias,
    });

    let outstandingAlias: string | undefined;
    if (lowerQuery.includes('outstanding')) {
      outstandingAlias = hasGroupings ? 'group_outstanding_total' : 'total_outstanding';
      aggregates.push({
        func: 'sum',
        field: 'outstanding_balance',
        alias: outstandingAlias,
      });
    }

    const ranking = this.extractRankingPreferences(query);
    const normalizedRankingLimit = this.normalizeAnalyticsLimit(ranking?.limit);
    const appliedLimit = normalizedRankingLimit ?? (hasGroupings ? 200 : 1);

    if (ranking) {
      orderBy.push({
        field: outstandingAlias ?? countAlias,
        direction: ranking.direction,
      });
    }

    const request: ClientDataQueryRequest = {
      source: 'client_data_overview',
      select: select.length ? select : undefined,
      aggregates,
      filters: filters.length ? filters : undefined,
      groupBy: groupBy.length ? groupBy : undefined,
      orderBy: orderBy.length ? orderBy : undefined,
      limit: appliedLimit,
    };

    const isSimpleClientTypeCount =
      groupBy.length === 1 &&
      groupBy[0] === 'client_type' &&
      filters.length === 0 &&
      orderBy.length === 0 &&
      !outstandingAlias &&
      aggregates.length === 1 &&
      aggregates[0].func === 'count';

    return {
      strategy: isSimpleClientTypeCount ? 'direct_client_type_counts' : 'structured_query',
      request,
      countAlias,
      groupKeys: groupBy,
      outstandingAlias,
    };
  }

  private prefersBriefAnalyticsResponse(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    const briefTriggers = ['how many', 'number of', 'count', 'total'];
    const detailTriggers = ['list', 'show me', 'detailed', 'breakdown', 'full list'];
    const wantsBrief = briefTriggers.some((keyword) => lowerQuery.includes(keyword));
    const wantsDetail = detailTriggers.some((keyword) => lowerQuery.includes(keyword));
    return wantsBrief && !wantsDetail;
  }

  private formatAnalyticsMessage(rows: ClientDataQueryRow[], plan: ClientAnalyticsPlan, prefersBrief: boolean): string {
    if (!rows.length) {
      return 'No clients matched the requested filters.';
    }

    const countAlias = plan.countAlias;
    const pickCount = (row: ClientDataQueryRow) => this.ensureNumber(row[countAlias]);
    const formatList = (parts: string[]) => (prefersBrief ? parts.join(', ') : parts.join('; '));

    if (plan.groupKeys.includes('client_type')) {
      const parts = rows.map((row) => `${this.formatClientTypeLabel(row.client_type)}: ${pickCount(row)}`);
      return prefersBrief ? parts.join(', ') : `Client counts by type — ${parts.join('; ')}.`;
    }

    if (plan.groupKeys.includes('county')) {
      const preview = prefersBrief ? rows.slice(0, 3) : rows;
      const parts = preview.map((row) => {
        const label = row.county ? String(row.county) : 'Unspecified county';
        let segment = `${label}: ${pickCount(row)}`;
        if (!prefersBrief && plan.outstandingAlias) {
          segment += ` (Outstanding $${this.formatCurrency(row[plan.outstandingAlias])})`;
        }
        return segment;
      });
      if (prefersBrief && rows.length > preview.length) {
        parts.push('…');
      }
      return `Client counts by county — ${formatList(parts)}`;
    }

    const total = pickCount(rows[0]);
    let message = prefersBrief
      ? `${total} client${total === 1 ? '' : 's'}.`
      : `Found ${total} client${total === 1 ? '' : 's'} matching the filters.`;

    if (!prefersBrief && plan.outstandingAlias) {
      message += ` Total outstanding balance: $${this.formatCurrency(rows[0]?.[plan.outstandingAlias])}.`;
    }

    return message;
  }

  private shouldFallbackToClientTypeCounts(plan: ClientAnalyticsPlan): boolean {
    if (plan.strategy !== 'structured_query') {
      return false;
    }
    const isClientTypeGrouping = plan.groupKeys.length === 1 && plan.groupKeys[0] === 'client_type';
    const hasNoFilters = !plan.request.filters || plan.request.filters.length === 0;
    const hasOnlyCountAggregate = !plan.outstandingAlias && plan.request.aggregates?.length === 1;
    return isClientTypeGrouping && hasNoFilters && hasOnlyCountAggregate;
  }

  private async fetchClientTypeCountsFallback(
    countAlias: string
  ): Promise<{ rows: ClientDataQueryRow[]; sql: string }> {
    const alias = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(countAlias) ? countAlias : 'client_count';
    const sql = `SELECT client_type, COUNT(*) AS ${alias} FROM client_profiles GROUP BY client_type`;
    const rows = await runSupabaseSql<ClientDataQueryRow>(sql, 10);
    return { rows, sql };
  }

  private async fetchDirectClientTypeCounts(
    countAlias: string
  ): Promise<{ rows: ClientDataQueryRow[]; sql: string } | null> {
    try {
      const alias = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(countAlias) ? countAlias : 'client_count';
      const sql = `
        SELECT
          LOWER(COALESCE(client_type, 'unknown')) AS client_type,
          COUNT(*)::int AS ${alias}
        FROM clients
        GROUP BY LOWER(COALESCE(client_type, 'unknown'))
      `;

      const rows = await runSupabaseSql<ClientDataQueryRow>(sql, 10);
      return { rows, sql };
    } catch (error) {
      console.error('Failed to fetch direct client counts:', error);
      return null;
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

  private formatClientTypeLabel(value: unknown): string {
    if (typeof value === 'string' && value.trim()) {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'civil' || normalized === 'criminal') {
        return normalized.charAt(0).toUpperCase() + normalized.slice(1);
      }
      return this.formatNamePart(value);
    }
    return 'Unspecified';
  }

  private ensureNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return 0;
  }

  private formatCurrency(value: unknown): string {
    return this.ensureNumber(value).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  private extractOutstandingBalanceFilter(
    query: string
  ): { operator: 'gt' | 'gte' | 'lt' | 'lte'; value: number } | null {
    const lower = query.toLowerCase();
    if (!lower.includes('outstanding')) {
      return null;
    }

    const comparisons: Array<{ regex: RegExp; operator: 'gt' | 'gte' | 'lt' | 'lte' }> = [
      { regex: /(?:at least|minimum of|no less than)\s*\$?\s*([\d,]+(?:\.\d+)?)/i, operator: 'gte' },
      { regex: /(?:over|above|greater than|more than)\s*\$?\s*([\d,]+(?:\.\d+)?)/i, operator: 'gt' },
      { regex: /(?:at most|maximum of|no more than)\s*\$?\s*([\d,]+(?:\.\d+)?)/i, operator: 'lte' },
      { regex: /(?:under|below|less than)\s*\$?\s*([\d,]+(?:\.\d+)?)/i, operator: 'lt' },
    ];

    for (const comparison of comparisons) {
      const match = query.match(comparison.regex);
      if (match && match[1]) {
        return {
          operator: comparison.operator,
          value: this.parseNumericAmount(match[1]),
        };
      }
    }

    return null;
  }

  private parseNumericAmount(value: string): number {
    const normalized = value.replace(/[, ]+/g, '');
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    return parsed;
  }

  private normalizeAnalyticsLimit(value?: number | null): number | undefined {
    if (!value || Number.isNaN(value)) {
      return undefined;
    }
    return Math.max(1, Math.min(200, Math.floor(value)));
  }

  private extractRankingPreferences(query: string): { limit: number; direction: 'asc' | 'desc' } | null {
    const topMatch = query.match(/\b(?:top|first|highest)\s+(\d+)\b/i);
    if (topMatch && topMatch[1]) {
      return {
        limit: parseInt(topMatch[1], 10),
        direction: 'desc',
      };
    }

    const bottomMatch = query.match(/\b(?:bottom|lowest|least)\s+(\d+)\b/i);
    if (bottomMatch && bottomMatch[1]) {
      return {
        limit: parseInt(bottomMatch[1], 10),
        direction: 'asc',
      };
    }

    return null;
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
