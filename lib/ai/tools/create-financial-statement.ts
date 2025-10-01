import { tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  artifactKinds,
  documentHandlersByArtifactKind,
} from "@/lib/artifacts/server";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

interface FinancialTransaction {
  id: string;
  transaction_type: string;
  amount: number;
  transaction_date: string;
  payment_method?: string;
  service_description?: string;
  notes?: string;
}

interface ClientInfo {
  id: string;
  name: string;
  total_quoted: number;
  total_paid: number;
  current_balance: number;
}

type CreateFinancialStatementProps = {
  session: any;
  dataStream: UIMessageStreamWriter<ChatMessage>;
};

async function generateFinancialStatementContent({
  clientName,
  includeTransactionHistory,
  statementDate,
  statementTitle,
  dataStream
}: {
  clientName: string;
  includeTransactionHistory: boolean;
  statementDate?: string;
  statementTitle: string;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}): Promise<string> {
  try {
    console.log('📄 FINANCIAL STATEMENT TOOL: Generating statement for:', clientName);

    // Validate environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ FINANCIAL STATEMENT TOOL: Missing Supabase environment variables');
      throw new Error('Database configuration error: Missing Supabase credentials');
    }

    // Create Supabase client
    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

    // Find the client by name
    console.log('📄 FINANCIAL STATEMENT TOOL: Finding client...');

    // First try to find in clients table
    let { data: clients, error: clientError } = await supabase
      .from('clients')
      .select('id, client_name')
      .ilike('client_name', clientName)
      .limit(1);

    // If clients table doesn't exist or no client found, check if financials table has client_name column
    if (clientError || !clients || clients.length === 0) {
      console.log('📄 FINANCIAL STATEMENT TOOL: Clients table not available or client not found, checking financials table...');

      // Check if financials table has client_name column (standalone version)
      const { data: financialClients, error: financialError } = await supabase
        .from('financials')
        .select('client_name')
        .ilike('client_name', clientName)
        .limit(1);

      if (!financialError && financialClients && financialClients.length > 0) {
        // Use the client name directly since we're in standalone mode
        clients = [{ id: null, client_name: clientName }];
        console.log('📄 FINANCIAL STATEMENT TOOL: Using standalone mode with client name');
      } else {
        console.log('❌ FINANCIAL STATEMENT TOOL: Client not found in either table');
      }
    }

    if (clientError) {
      console.error('❌ FINANCIAL STATEMENT TOOL: Client search failed:', clientError);
      throw new Error(`Failed to find client: ${clientError.message}`);
    }

    if (!clients || clients.length === 0) {
      console.log('❌ FINANCIAL STATEMENT TOOL: Client not found:', clientName);
      throw new Error(`Client "${clientName}" not found. Please check the name and try again.`);
    }

    const client = clients[0];
    console.log('✅ FINANCIAL STATEMENT TOOL: Found client:', client.client_name);

    // Get current balance summary
    console.log('📄 FINANCIAL STATEMENT TOOL: Getting balance summary...');

    let balanceData = null;
    let balanceError = null;

    if (client.id) {
      // Use the optimized function if we have client_id
      const result = await supabase
        .rpc('get_client_balance', {
          client_uuid: client.id
        });
      balanceData = result.data;
      balanceError = result.error;
    } else {
      // Calculate balance manually for standalone mode
      const { data: manualBalanceData, error: manualBalanceError } = await supabase
        .from('financials')
        .select('transaction_type, amount')
        .eq('client_name', client.client_name);

      if (!manualBalanceError && manualBalanceData) {
        let totalQuoted = 0;
        let totalPaid = 0;

        manualBalanceData.forEach((transaction: any) => {
          if (transaction.transaction_type === 'quote') {
            totalQuoted += Number(transaction.amount);
          } else {
            totalPaid += Number(transaction.amount);
          }
        });

        balanceData = [{
          total_quoted: totalQuoted,
          total_paid: totalPaid,
          balance: totalQuoted - totalPaid,
          transaction_count: manualBalanceData.length
        }];
      }
    }

    if (balanceError) {
      console.warn('⚠️ FINANCIAL STATEMENT TOOL: Could not get balance:', balanceError);
    }

    // Get transaction history if requested
    let transactions: FinancialTransaction[] = [];
    if (includeTransactionHistory) {
      console.log('📄 FINANCIAL STATEMENT TOOL: Getting transaction history...');

      let query = supabase
        .from('financials')
        .select('*')
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false });

      // Add client filter based on what's available
      if (client.id) {
        query = query.eq('client_id', client.id);
      } else {
        // Use client name filter (standalone mode)
        query = query.eq('client_name', client.client_name);
      }

      const { data: transactionsData, error: transactionsError } = await query;

      if (transactionsError) {
        console.warn('⚠️ FINANCIAL STATEMENT TOOL: Could not get transaction history:', transactionsError);
      } else {
        transactions = transactionsData || [];
      }
    }

    // Format client info
    const clientInfo: ClientInfo = {
      id: client.id || 'standalone',
      name: client.client_name,
      total_quoted: balanceData ? Number(balanceData[0]?.total_quoted || 0) : 0,
      total_paid: balanceData ? Number(balanceData[0]?.total_paid || 0) : 0,
      current_balance: balanceData ? Number(balanceData[0]?.balance || 0) : 0,
    };

    // Generate the financial statement document
    const currentDate = statementDate ? new Date(statementDate) : new Date();
    const formattedDate = currentDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Generate HTML document content
    const documentContent = generateFinancialStatementHTML({
      clientInfo,
      transactions: includeTransactionHistory ? transactions : [],
      statementDate: formattedDate,
      statementTitle,
      includeTransactionHistory
    });

    return documentContent;

  } catch (error) {
    console.error('❌ FINANCIAL STATEMENT TOOL: Error generating financial statement:', error);
    throw error;
  }
}

export const createFinancialStatement = ({ session, dataStream }: CreateFinancialStatementProps) =>
  tool({
    description: "Generate a professional financial statement document for a client based on their transaction history and account balance.",
    inputSchema: z.object({
      clientName: z.string().describe("Name of the client to generate the financial statement for"),
      includeTransactionHistory: z.boolean().optional().default(true).describe("Whether to include detailed transaction history in the statement"),
      statementDate: z.string().optional().describe("Date for the statement (YYYY-MM-DD format). Defaults to current date"),
      statementTitle: z.string().optional().default("Financial Statement").describe("Title for the financial statement document"),
    }),
    execute: async ({
      clientName,
      includeTransactionHistory = true,
      statementDate,
      statementTitle = "Financial Statement"
    }) => {
      // Generate the content without artifacts
      const documentContent = await generateFinancialStatementContent({
        clientName,
        includeTransactionHistory,
        statementDate,
        statementTitle,
        dataStream
      });

      // Create a unique ID for this document
      const id = generateUUID();

      // Save the document to database
      try {
        const documentHandler = documentHandlersByArtifactKind.find(
          (handler) => handler.kind === "financial-statement"
        );
        
        if (documentHandler && session?.user?.id) {
          await documentHandler.onCreateDocument({
            id,
            title: `${statementTitle} - ${clientName}`,
            dataStream,
            session,
          });
        }
      } catch (error) {
        console.warn('⚠️ FINANCIAL STATEMENT TOOL: Could not save document to database:', error);
      }

      console.log('📄 FINANCIAL STATEMENT TOOL: Financial statement generated for:', clientName);

      // Don't return any result that would cause the AI to generate a text response
      // The download button in the chat is the only user interface needed
      return {
        id,
        clientName,
        title: `${statementTitle} - ${clientName}`,
        content: "The financial statement has been generated and is ready for download. Please click the download button above."
      };
    },
  });

function generateFinancialStatementHTML({
  clientInfo,
  transactions,
  statementDate,
  statementTitle,
  includeTransactionHistory
}: {
  clientInfo: ClientInfo;
  transactions: FinancialTransaction[];
  statementDate: string;
  statementTitle: string;
  includeTransactionHistory: boolean;
}) {
  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;
  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('en-US');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${statementTitle} - ${clientInfo.name}</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
            }
            .header {
                text-align: center;
                margin-bottom: 40px;
                border-bottom: 2px solid #2c3e50;
                padding-bottom: 20px;
            }
            .header h1 {
                color: #2c3e50;
                margin: 0;
                font-size: 28px;
            }
            .header .date {
                color: #7f8c8d;
                font-size: 16px;
                margin-top: 10px;
            }
            .client-info {
                background-color: #f8f9fa;
                padding: 20px;
                border-radius: 8px;
                margin-bottom: 30px;
            }
            .client-info h2 {
                margin-top: 0;
                color: #2c3e50;
            }
            .summary-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 20px;
                margin-bottom: 30px;
            }
            .summary-item {
                background-color: #fff;
                padding: 15px;
                border-radius: 6px;
                border-left: 4px solid #3498db;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .summary-item h3 {
                margin: 0 0 10px 0;
                font-size: 14px;
                text-transform: uppercase;
                color: #7f8c8d;
            }
            .summary-item .amount {
                font-size: 24px;
                font-weight: bold;
                color: #2c3e50;
            }
            .summary-item.positive .amount {
                color: #27ae60;
            }
            .summary-item.negative .amount {
                color: #e74c3c;
            }
            .transactions {
                margin-top: 40px;
            }
            .transactions h2 {
                color: #2c3e50;
                border-bottom: 1px solid #bdc3c7;
                padding-bottom: 10px;
            }
            .transaction-table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 20px;
            }
            .transaction-table th,
            .transaction-table td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid #ecf0f1;
            }
            .transaction-table th {
                background-color: #34495e;
                color: white;
                font-weight: 600;
            }
            .transaction-table tr:hover {
                background-color: #f8f9fa;
            }
            .transaction-type {
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: bold;
                text-transform: uppercase;
            }
            .transaction-type.quote {
                background-color: #e67e22;
                color: white;
            }
            .transaction-type.payment {
                background-color: #27ae60;
                color: white;
            }
            .transaction-type.adjustment {
                background-color: #8e44ad;
                color: white;
            }
            .footer {
                margin-top: 50px;
                text-align: center;
                color: #7f8c8d;
                font-size: 14px;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>${statementTitle}</h1>
            <div class="date">Statement Date: ${statementDate}</div>
        </div>

        <div class="client-info">
            <h2>Client Information</h2>
            <p><strong>Client Name:</strong> ${clientInfo.name}</p>
            <p><strong>Client ID:</strong> ${clientInfo.id}</p>
        </div>

        <div class="summary-grid">
            <div class="summary-item">
                <h3>Total Quoted</h3>
                <div class="amount">${formatCurrency(clientInfo.total_quoted)}</div>
            </div>
            <div class="summary-item">
                <h3>Total Paid</h3>
                <div class="amount">${formatCurrency(clientInfo.total_paid)}</div>
            </div>
            <div class="summary-item ${clientInfo.current_balance >= 0 ? 'positive' : 'negative'}">
                <h3>Current Balance</h3>
                <div class="amount">${formatCurrency(clientInfo.current_balance)}</div>
            </div>
        </div>

        ${includeTransactionHistory && transactions.length > 0 ? `
        <div class="transactions">
            <h2>Transaction History</h2>
            <table class="transaction-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Description</th>
                        <th>Payment Method</th>
                        <th>Amount</th>
                        <th>Notes</th>
                    </tr>
                </thead>
                <tbody>
                    ${transactions.map(transaction => `
                    <tr>
                        <td>${formatDate(transaction.transaction_date)}</td>
                        <td><span class="transaction-type ${transaction.transaction_type}">${transaction.transaction_type}</span></td>
                        <td>${transaction.service_description || '-'}</td>
                        <td>${transaction.payment_method || '-'}</td>
                        <td>${formatCurrency(Number(transaction.amount))}</td>
                        <td>${transaction.notes || '-'}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        ` : ''}

        <div class="footer">
            <p>This financial statement was generated on ${statementDate}.</p>
            <p>For questions about this statement, please contact your account manager.</p>
        </div>
    </body>
    </html>
  `;
}