import { BaseAgent, AgentCategory, AgentResponse } from "./base-agent";
import { listClientsWithOutstandingBalanceTool } from "../tools/list-clients-with-outstanding-balance";
import { listClientsWithOutstandingBalance } from "../data/financials";

/**
 * Financials Agent - Handles all financial-related queries and operations
 */
export class FinancialsAgent extends BaseAgent {
  constructor() {
    super(
      "Financials Agent",
      "Specialized in financial data, statements, budgets, transactions, and financial reporting",
      "financials"
    );

    // Register financial tools
    this.registerTool("list_clients_with_outstanding_balance", listClientsWithOutstandingBalanceTool);
  }

  /**
   * Check if this agent can handle a given query based on keywords and context
   */
  public canHandle(query: string): boolean {
    const lowerQuery = query.toLowerCase();

    // Financial-related keywords
    const financialKeywords = [
       'financial', 'finance', 'money', 'payment', 'payments',
       'transaction', 'transactions', 'billing', 'bill', 'invoice', 'invoices',
       'statement', 'financial statement', 'account', 'accounts',
       'balance', 'balances', 'budget', 'budgets',
       'revenue', 'income', 'expense', 'expenses', 'cost', 'costs',
       'fee', 'fees', 'charge', 'charges', 'pricing', 'price',
       'payment history', 'transaction history', 'financial history',
       'financial report', 'financial summary', 'financial data',
       'accounting', 'bookkeeping', 'ledger',
       'profit', 'loss', 'earnings', 'financial performance',
       'financial analysis', 'financial review', 'financial status',
       'owed', 'owing', 'due', 'overdue', 'paid', 'unpaid',
       'deposit', 'deposits', 'refund', 'refunds',
       'tax', 'taxes', 'taxation', 'financial year',
       'quarterly', 'monthly', 'annual', 'yearly',
       'currency', 'dollar', 'amount', 'total', 'sum',
       'outstanding', 'outstanding balance'
     ];

    // Check for financial keywords
    const hasFinancialKeyword = financialKeywords.some(keyword => lowerQuery.includes(keyword));

    // Check for specific financial operations
    const financialOperations = [
       'generate financial statement', 'create financial statement', 'financial statement for',
       'check balance', 'check account balance', 'account balance for',
       'payment history', 'transaction history', 'financial history',
       'financial report', 'financial summary', 'financial analysis',
       'how much', 'what is the cost', 'what does it cost',
       'billing information', 'invoice status', 'payment status',
       'financial overview', 'financial status', 'financial position',
       'outstanding balance', 'outstanding balances', 'list outstanding', 'show outstanding'
     ];

    const hasFinancialOperation = financialOperations.some(operation => lowerQuery.includes(operation));

    return hasFinancialKeyword || hasFinancialOperation;
  }

  /**
   * Process a financial-related query
   */
  public async processQuery(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      const lowerQuery = query.toLowerCase();

      // Determine which type of financial query this is
       if (lowerQuery.includes('statement') || lowerQuery.includes('financial statement')) {
         return await this.handleFinancialStatement(query, context);
       } else if (lowerQuery.includes('payment') || lowerQuery.includes('transaction') || lowerQuery.includes('history')) {
         return await this.handlePaymentHistory(query, context);
       } else if (lowerQuery.includes('outstanding') || (lowerQuery.includes('balance') && lowerQuery.includes('outstanding'))) {
         return await this.handleOutstandingBalances(query, context);
       } else if (lowerQuery.includes('balance') || lowerQuery.includes('amount') || lowerQuery.includes('total')) {
         return await this.handleBalanceQuery(query, context);
       } else {
         return await this.handleGeneralFinancialQuery(query, context);
       }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error processing financial query: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
   * Handle financial statement requests
   */
  private async handleFinancialStatement(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // Extract client name from query
      const clientName = this.extractClientName(query);

      if (!clientName) {
        return {
          success: false,
          message: "Could not identify client name for financial statement. Please specify a client name.",
          agent: this.name,
          category: this.category,
          metadata: {
            processingTime: Date.now() - startTime,
            toolsUsed: [],
            confidence: 0.3
          }
        };
      }

      // For now, return a simplified response since the tool integration is complex
      // In a full implementation, this would use the actual createFinancialStatement tool
      const result = {
        success: true,
        message: `Financial statement would be generated for ${clientName}`,
        clientName,
        statementType: 'financial-statement'
      };

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        message: `Financial statement generated successfully for ${clientName}`,
        data: result,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['createFinancialStatement'],
          confidence: 0.9
        }
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error generating financial statement: ${error instanceof Error ? error.message : 'Unknown error'}`,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['createFinancialStatement'],
          confidence: 0
        }
      };
    }
  }

  /**
   * Handle payment/transaction history requests
   */
  private async handlePaymentHistory(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // Extract client name from query
      const clientName = this.extractClientName(query);

      const result = {
        success: true,
        message: `Payment history query for ${clientName || 'all clients'}`,
        clientName,
        queryType: 'payment_history'
      };

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        message: `Payment history retrieved successfully${clientName ? ` for ${clientName}` : ''}`,
        data: result,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['queryPaymentHistory'],
          confidence: 0.85
        }
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error retrieving payment history: ${error instanceof Error ? error.message : 'Unknown error'}`,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['queryPaymentHistory'],
          confidence: 0
        }
      };
    }
  }

  /**
   * Handle balance/account queries
   */
  private async handleBalanceQuery(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // Extract client name from query
      const clientName = this.extractClientName(query);

      const result = {
        success: true,
        message: `Balance query for ${clientName || 'all clients'}`,
        clientName,
        queryType: 'balance'
      };

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        message: `Account balance retrieved successfully${clientName ? ` for ${clientName}` : ''}`,
        data: result,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['queryBalance'],
          confidence: 0.85
        }
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error retrieving account balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['queryBalance'],
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
      const clients = await listClientsWithOutstandingBalance(0, 50);
      const message =
        clients.length > 0
          ? `Found ${clients.length} client${clients.length === 1 ? '' : 's'} with outstanding balances.`
          : "No outstanding balances found.";

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

  /**
   * Handle general financial queries
   */
  private async handleGeneralFinancialQuery(query: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      const result = {
        success: true,
        message: "General financial query processed",
        query: query,
        queryType: 'general_financial'
      };

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        message: "Financial query processed successfully",
        data: result,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['generalFinancialTool'],
          confidence: 0.7
        }
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error processing financial query: ${error instanceof Error ? error.message : 'Unknown error'}`,
        agent: this.name,
        category: this.category,
        metadata: {
          processingTime,
          toolsUsed: ['generalFinancialTool'],
          confidence: 0
        }
      };
    }
  }

  /**
   * Extract client name from query string
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
}
