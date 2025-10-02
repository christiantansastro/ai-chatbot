import { createDocumentHandler } from "@/lib/artifacts/server";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { UIMessageStreamWriter } from "ai";
import type { ChatMessage } from "@/lib/types";

async function generateFinancialStatementContent({
  clientName,
  dataStream
}: {
  clientName: string;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}): Promise<string> {
  // Generate content without streaming it
  const content = await generateFinancialStatementContentWithoutStreaming({ clientName });

  // Don't stream the content - we'll handle it in the tool
  console.log('📄 FINANCIAL STATEMENT SERVER: Generated content for client:', clientName);

  return content;
}

async function generateFinancialStatementContentWithoutStreaming({
  clientName
}: {
  clientName: string;
}): Promise<string> {
  try {
    console.log('📄 FINANCIAL STATEMENT SERVER: Generating statement for:', clientName);

    // Validate environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ FINANCIAL STATEMENT SERVER: Missing Supabase environment variables');
      console.error('Supabase URL:', supabaseUrl ? 'Present' : 'Missing');
      console.error('Supabase Key:', supabaseKey ? 'Present' : 'Missing');
      throw new Error('Database configuration error: Missing Supabase credentials');
    }

    // Create Supabase client
    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);
    console.log('📄 FINANCIAL STATEMENT SERVER: Supabase client created');

    // Find the client by name
    console.log('📄 FINANCIAL STATEMENT SERVER: Finding client...');

    // First try to find in clients table
    console.log('📄 FINANCIAL STATEMENT SERVER: Querying clients table for:', clientName);
    let { data: clients, error: clientError } = await supabase
      .from('clients')
      .select('id, client_name')
      .ilike('client_name', clientName)
      .limit(1);
    console.log('📄 FINANCIAL STATEMENT SERVER: Clients query result:', { clients, clientError });

    // If clients table doesn't exist or no client found, check if financials table has client_name column
    if (clientError || !clients || clients.length === 0) {
      console.log('📄 FINANCIAL STATEMENT SERVER: Clients table not available or client not found, checking financials table...');

      // Check if financials table has client_name column (standalone version)
      console.log('📄 FINANCIAL STATEMENT SERVER: Querying financials table for:', clientName);
      const { data: financialClients, error: financialError } = await supabase
        .from('financials')
        .select('client_name')
        .ilike('client_name', clientName)
        .limit(1);

      console.log('📄 FINANCIAL STATEMENT SERVER: Financials query result:', { financialClients, financialError });

      if (financialError) {
        console.error('❌ FINANCIAL STATEMENT SERVER: Database tables not set up yet. Please run the database setup script first.');
        console.error('Financials table error:', financialError);
        throw new Error('Database not configured. Please run the financial database setup script in your Supabase dashboard.');
      }

      if (!financialError && financialClients && financialClients.length > 0) {
        // Use the client name directly since we're in standalone mode
        clients = [{ id: null, client_name: clientName }];
        console.log('📄 FINANCIAL STATEMENT SERVER: Using standalone mode with client name');
      } else {
        console.log('❌ FINANCIAL STATEMENT SERVER: Client not found in either table');
      }
    }

    if (clientError) {
      console.error('❌ FINANCIAL STATEMENT SERVER: Client search failed:', clientError);

      // If it's a relation error, the tables might not exist yet
      if (clientError.message.includes('relation "clients" does not exist') ||
          clientError.message.includes('relation "financials" does not exist')) {
        console.log('📄 FINANCIAL STATEMENT SERVER: Database tables not found, generating demo statement');
        return generateDemoFinancialStatement(clientName);
      }

      // For other errors, also try demo mode
      console.log('📄 FINANCIAL STATEMENT SERVER: Database query failed, falling back to demo mode');
      return generateDemoFinancialStatement(clientName);
    }

    if (!clients || clients.length === 0) {
      console.log('❌ FINANCIAL STATEMENT SERVER: Client not found:', clientName);
      throw new Error(`Client "${clientName}" not found. Please check the name and try again.`);
    }

    const client = clients[0];
    console.log('✅ FINANCIAL STATEMENT SERVER: Found client:', client.client_name);

    // Get current balance summary
    console.log('📄 FINANCIAL STATEMENT SERVER: Getting balance summary...');

    let balanceData = null;
    let balanceError = null;

    // Use the updated function that supports both client_id and client_name
    console.log('📄 FINANCIAL STATEMENT SERVER: Calling get_client_balance function');
    console.log('📄 FINANCIAL STATEMENT SERVER: Client data:', { id: client.id, name: client.client_name });

    const result = await supabase
      .rpc('get_client_balance', {
        client_uuid: client.id,
        client_name_param: client.client_name
      });
    balanceData = result.data;
    balanceError = result.error;
    console.log('📄 FINANCIAL STATEMENT SERVER: Balance function result:', { balanceData, balanceError });
    console.log('📄 FINANCIAL STATEMENT SERVER: Raw result:', result);

    if (balanceError) {
      console.error('❌ FINANCIAL STATEMENT SERVER: Error getting balance:', balanceError);

      // If balance function doesn't exist, fall back to demo mode
      if (balanceError.message.includes('function get_client_balance') ||
          balanceError.message.includes('does not exist')) {
        console.log('📄 FINANCIAL STATEMENT SERVER: Balance function not found, using demo mode');
        return generateDemoFinancialStatement(clientName);
      }

      throw new Error('Database query failed. Please ensure the financial tables are set up correctly.');
    }

    // If balance data is null or empty, calculate manually
    if (!balanceData || balanceData.length === 0) {
      console.log('📄 FINANCIAL STATEMENT SERVER: Balance data empty, calculating manually...');

      // Manual calculation as fallback
      const { data: manualTransactions, error: manualError } = await supabase
        .from('financials')
        .select('transaction_type, amount')
        .eq('client_name', client.client_name);

      if (!manualError && manualTransactions) {
        let totalQuoted = 0;
        let totalPaid = 0;

        manualTransactions.forEach((transaction: any) => {
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
          transaction_count: manualTransactions.length
        }];

        console.log('📄 FINANCIAL STATEMENT SERVER: Manual calculation result:', balanceData);
      }
    }

    // Get transaction history
    console.log('📄 FINANCIAL STATEMENT SERVER: Getting transaction history...');

    let transactions: any[] = [];
    let query = supabase
      .from('financials')
      .select('*')
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20);

    // Use both client_id and client_name for maximum compatibility
    query = query
      .eq('client_id', client.id)
      .eq('client_name', client.client_name);

    console.log('📄 FINANCIAL STATEMENT SERVER: Executing transaction query');
    const { data: transactionsData, error: transactionsError } = await query;
    console.log('📄 FINANCIAL STATEMENT SERVER: Transaction query result:', { transactionsData, transactionsError });

    if (transactionsError) {
      console.warn('⚠️ FINANCIAL STATEMENT SERVER: Could not get transaction history:', transactionsError);

      // If tables don't exist, fall back to demo mode
      if (transactionsError.message.includes('relation "financials" does not exist')) {
        console.log('📄 FINANCIAL STATEMENT SERVER: Financials table not found, using demo mode');
        return generateDemoFinancialStatement(clientName);
      }

      // For other errors, just use empty array
      transactions = [];
    } else {
      transactions = transactionsData || [];
    }

    // Format client info
    const clientInfo = {
      id: client.id || 'standalone',
      name: client.client_name,
      total_quoted: balanceData ? Number(balanceData[0]?.total_quoted || 0) : 0,
      total_paid: balanceData ? Number(balanceData[0]?.total_paid || 0) : 0,
      current_balance: balanceData ? Number(balanceData[0]?.balance || 0) : 0,
    };

    // Generate the financial statement document
    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Generate HTML document content
    const documentContent = generateFinancialStatementHTML({
      clientInfo,
      transactions,
      statementDate: formattedDate,
      statementTitle: "Financial Statement",
      includeTransactionHistory: true
    });

    console.log('📄 FINANCIAL STATEMENT SERVER: Generated content length:', documentContent.length);
    return documentContent;

  } catch (error) {
    console.error('❌ FINANCIAL STATEMENT SERVER: Error generating financial statement:', error);

    if (error instanceof Error && error.message.includes('Database not configured')) {
      throw error; // Re-throw database setup errors
    }

    // For other errors, provide a more user-friendly message
    throw new Error(`Unable to generate financial statement for "${clientName}". Please ensure the client exists in the system and try again.`);
  }
}

function generateFinancialStatementHTML({
  clientInfo,
  transactions,
  statementDate,
  statementTitle,
  includeTransactionHistory
}: {
  clientInfo: any;
  transactions: any[];
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
                        <th>Due Date</th>
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
                        <td>${transaction.payment_due_date ? formatDate(transaction.payment_due_date) : '-'}</td>
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

function generateDemoFinancialStatement(clientName: string): string {
  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Financial Statement - ${clientName} (Demo)</title>
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
            .demo-notice {
                background-color: #fff3cd;
                border: 1px solid #ffeaa7;
                color: #856404;
                padding: 15px;
                border-radius: 8px;
                margin-bottom: 30px;
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
            <h1>Financial Statement</h1>
            <div class="date">Statement Date: ${currentDate}</div>
        </div>

        <div class="demo-notice">
            <strong>Demo Mode:</strong> This is a demonstration financial statement. To generate real financial statements, please run the database setup script in your Supabase dashboard to create the required tables.
        </div>

        <div class="client-info">
            <h2>Client Information</h2>
            <p><strong>Client Name:</strong> ${clientName}</p>
            <p><strong>Client ID:</strong> DEMO-CLIENT</p>
        </div>

        <div class="summary-grid">
            <div class="summary-item">
                <h3>Total Quoted</h3>
                <div class="amount">$2,500.00</div>
            </div>
            <div class="summary-item">
                <h3>Total Paid</h3>
                <div class="amount">$1,500.00</div>
            </div>
            <div class="summary-item negative">
                <h3>Current Balance</h3>
                <div class="amount">$1,000.00</div>
            </div>
        </div>

        <div class="transactions">
            <h2>Transaction History (Demo)</h2>
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
                    <tr>
                        <td>2025-01-15</td>
                        <td><span class="transaction-type quote">Quote</span></td>
                        <td>Legal consultation services</td>
                        <td>-</td>
                        <td>$2,500.00</td>
                        <td>Initial consultation and case review</td>
                    </tr>
                    <tr>
                        <td>2025-01-20</td>
                        <td><span class="transaction-type payment">Payment</span></td>
                        <td>Partial payment</td>
                        <td>Credit Card</td>
                        <td>$1,500.00</td>
                        <td>First installment payment</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="footer">
            <p>This financial statement was generated on ${currentDate}.</p>
            <p><strong>Demo Mode:</strong> Connect to a properly configured database to generate real financial statements.</p>
        </div>
    </body>
    </html>
  `;
}

export const financialStatementDocumentHandler = createDocumentHandler<"financial-statement">({
  kind: "financial-statement",
  onCreateDocument: async ({ id, title, dataStream, session }) => {
    console.log('📄 FINANCIAL STATEMENT HANDLER: onCreateDocument called', { id, title, session: !!session });

    // Extract client name from title (format: "Financial Statement - ClientName")
    const clientNameMatch = title.match(/Financial Statement - (.+)/);
    const clientName = clientNameMatch ? clientNameMatch[1] : "Unknown Client";
    console.log('📄 FINANCIAL STATEMENT HANDLER: Extracted client name:', clientName);

    // For financial statements, the content should be the same as what was streamed
    // Generate the full content here as well for database storage
    console.log('📄 FINANCIAL STATEMENT HANDLER: Document handler called for:', title);

    // Generate the complete financial statement content for database storage
    const fullContent = await generateFinancialStatementContentWithoutStreaming({
      clientName
    });

    console.log('📄 FINANCIAL STATEMENT HANDLER: Returning full content for database storage');
    return fullContent;
  },
  onUpdateDocument: async ({ document, description, dataStream }) => {
    // For financial statements, we could implement editing capabilities here
    let draftContent = document.content || '';

    // For now, just return the existing content
    // In a real implementation, you might want to use AI to modify the statement
    // Don't stream the content - we handle it differently for financial statements
    return draftContent;
  },
});