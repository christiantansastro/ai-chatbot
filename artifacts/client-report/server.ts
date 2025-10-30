import { createDocumentHandler } from "@/lib/artifacts/server";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { UIMessageStreamWriter } from "ai";
import type { ChatMessage } from "@/lib/types";

// Interfaces matching actual database schema
interface ClientCommunication {
  id: string;
  communication_date: string;
  communication_type: string;
  subject: string;
  notes: string;
}

interface ClientFinancialRecord {
  id: string;
  transaction_type: string;
  amount: number;
  transaction_date: string;
  payment_method?: string;
  service_description?: string;
  notes?: string;
  case_number?: string;
  payment_due_date?: string;
}

interface ClientFinancialSummary {
  total_quoted: number;
  total_paid: number;
  balance: number;
  transaction_count: number;
  outstanding_payments: ClientFinancialRecord[];
  recent_transactions: ClientFinancialRecord[];
  payment_methods: string[];
  last_payment_date?: string;
}

interface ClientInfo {
  id: string;
  client_name: string;
  client_type?: string;
  date_intake?: string;
  date_of_birth?: string;
  address?: string;
  phone?: string;
  email?: string;
  contact_1?: string;
  relationship_1?: string;
  contact_1_phone?: string;
  contact_2?: string;
  relationship_2?: string;
  contact_2_phone?: string;
  notes?: string;
  county?: string;
  court_date?: string;
  quoted?: number;
  initial_payment?: number;
  due_date_balance?: string;
  // Criminal-specific fields
  arrested?: boolean;
  charges?: string;
  // Civil-specific fields
  served_papers_or_initial_filing?: string;
  case_type?: string;
  created_at: string;
  updated_at: string;
}

async function generateClientReportContent({
  clientName,
  dataStream
}: {
  clientName: string;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}): Promise<string> {
  // Generate content and stream it
  const content = await generateClientReportContentWithoutStreaming({ clientName });

  // Stream the content as it's generated
  console.log('📄 CLIENT REPORT SERVER: Streaming content to dataStream');
  dataStream.write({
    type: "data-textDelta",
    data: content,
    transient: true,
  });

  return content;
}

async function generateClientReportContentWithoutStreaming({
  clientName
}: {
  clientName: string;
}): Promise<string> {
  try {
    console.log('📄 CLIENT REPORT SERVER: Generating report for:', clientName);

    // Validate environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ CLIENT REPORT SERVER: Missing Supabase environment variables');
      throw new Error('Database configuration error: Missing Supabase credentials');
    }

    // Create Supabase client
    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

    // Find the client by name
    console.log('📄 CLIENT REPORT SERVER: Finding client...');

    let { data: clients, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .ilike('client_name', clientName)
      .limit(1);

    if (clientError) {
      console.error('❌ CLIENT REPORT SERVER: Client search failed:', clientError);
      throw new Error(`Failed to find client: ${clientError.message}`);
    }

    if (!clients || clients.length === 0) {
      console.log('❌ CLIENT REPORT SERVER: Client not found:', clientName);
      throw new Error(`Client "${clientName}" not found. Please check the name and try again.`);
    }

    const client = clients[0];
    console.log('✅ CLIENT REPORT SERVER: Found client:', client.client_name);

    // Get communication history - only select actual fields
    console.log('📄 CLIENT REPORT SERVER: Getting communication history...');

    let communications: ClientCommunication[] = [];
    let query = supabase
      .from('communications')
      .select('id, communication_date, communication_type, subject, notes')
      .order('communication_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20);

    // Add client filter based on what's available
    if (client.id) {
      query = query.eq('client_id', client.id);
    }

    const { data: communicationsData, error: communicationsError } = await query;

    if (communicationsError) {
      console.warn('⚠️ CLIENT REPORT SERVER: Could not get communication history:', communicationsError);
      communications = [];
    } else {
      communications = (communicationsData || []).map(record => ({
        id: record.id,
        communication_date: record.communication_date,
        communication_type: record.communication_type,
        subject: record.subject || '',
        notes: record.notes || ''
      }));
    }

    console.log(`📄 CLIENT REPORT SERVER: Found ${communications.length} communications`);

    // Get financial data
    console.log('📄 CLIENT REPORT SERVER: Getting financial data...');
    let financialData: ClientFinancialRecord[] = [];
    let financialSummary: ClientFinancialSummary = {
      total_quoted: 0,
      total_paid: 0,
      balance: 0,
      transaction_count: 0,
      outstanding_payments: [],
      recent_transactions: [],
      payment_methods: []
    };

    try {
      const financialsQuery = supabase
        .from('financials')
        .select('*')
        .order('transaction_date', { ascending: false });

      if (client.id) {
        financialsQuery.eq('client_id', client.id);
      }

      const { data: financialsRecords, error: financialsError } = await financialsQuery;

      if (financialsError) {
        console.warn('⚠️ CLIENT REPORT SERVER: Could not get financial data:', financialsError);
        financialData = [];
      } else {
        financialData = (financialsRecords || []).map(record => ({
          id: record.id,
          transaction_type: record.transaction_type,
          amount: Number(record.amount) || 0,
          transaction_date: record.transaction_date,
          payment_method: record.payment_method,
          service_description: record.service_description,
          notes: record.notes,
          case_number: record.case_number,
          payment_due_date: record.payment_due_date
        }));
      }

      console.log(`📄 CLIENT REPORT SERVER: Found ${financialData.length} financial records`);

      // Calculate financial summary only if we have data
      if (financialData.length > 0) {
        const totalQuoted = financialData
          .filter(t => t.transaction_type === 'quote')
          .reduce((sum, t) => sum + t.amount, 0);
        
        const totalPaid = financialData
          .filter(t => t.transaction_type === 'payment' || t.transaction_type === 'adjustment')
          .reduce((sum, t) => sum + t.amount, 0);
        
        const uniquePaymentMethods = Array.from(new Set(
          financialData
            .filter(t => t.payment_method)
            .map(t => t.payment_method!)
        ));

        financialSummary = {
          total_quoted: totalQuoted,
          total_paid: totalPaid,
          balance: totalQuoted - totalPaid,
          transaction_count: financialData.length,
          outstanding_payments: financialData
            .filter(t => t.transaction_type === 'quote' && new Date(t.transaction_date) < new Date())
            .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()),
          recent_transactions: financialData
            .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime())
            .slice(0, 10),
          payment_methods: uniquePaymentMethods,
          last_payment_date: financialData
            .filter(t => t.transaction_type === 'payment')
            .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime())[0]?.transaction_date
        };
      }
    } catch (financialError) {
      console.warn('⚠️ CLIENT REPORT SERVER: Error processing financial data:', financialError);
      // Use empty financial summary
    }

    // Format comprehensive client info
    const clientInfo: ClientInfo = {
      id: client.id || 'standalone',
      client_name: client.client_name,
      client_type: client.client_type,
      date_intake: client.date_intake,
      date_of_birth: client.date_of_birth,
      address: client.address,
      phone: client.phone,
      email: client.email,
      contact_1: client.contact_1,
      relationship_1: client.relationship_1,
      contact_1_phone: client.contact_1_phone,
      contact_2: client.contact_2,
      relationship_2: client.relationship_2,
      contact_2_phone: client.contact_2_phone,
      notes: client.notes,
      county: client.county,
      court_date: client.court_date,
      quoted: Number(client.quoted) || 0,
      initial_payment: Number(client.initial_payment) || 0,
      due_date_balance: client.due_date_balance,
      arrested: client.arrested,
      charges: client.charges,
      served_papers_or_initial_filing: client.served_papers_or_initial_filing,
      case_type: client.case_type,
      created_at: client.created_at,
      updated_at: client.updated_at,
    };

    // Generate the client report document
    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Generate HTML document content
    const documentContent = generateClientReportHTML({
      clientInfo,
      communications,
      financialSummary,
      reportDate: formattedDate,
      reportTitle: "Client Report",
      includeCommunicationHistory: true
    });

    console.log('📄 CLIENT REPORT SERVER: Generated content length:', documentContent.length);
    return documentContent;

  } catch (error) {
    console.error('❌ CLIENT REPORT SERVER: Error generating client report:', error);
    throw new Error(`Unable to generate client report for "${clientName}". Please ensure the client exists in the system and try again.`);
  }
}

function generateClientReportHTML({
  clientInfo,
  communications,
  financialSummary,
  reportDate,
  reportTitle,
  includeCommunicationHistory
}: {
  clientInfo: ClientInfo;
  communications: ClientCommunication[];
  financialSummary: ClientFinancialSummary;
  reportDate: string;
  reportTitle: string;
  includeCommunicationHistory: boolean;
}) {
  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleDateString('en-US');
    } catch {
      return dateString;
    }
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${reportTitle} - ${clientInfo.client_name}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1000px;
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
        .section {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 30px;
        }
        .section h2 {
            margin-top: 0;
            color: #2c3e50;
            border-bottom: 1px solid #bdc3c7;
            padding-bottom: 10px;
        }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }
        .info-item {
            background-color: #fff;
            padding: 12px;
            border-radius: 6px;
            border-left: 4px solid #3498db;
        }
        .info-item .label {
            font-size: 12px;
            text-transform: uppercase;
            color: #7f8c8d;
            margin-bottom: 4px;
        }
        .info-item .value {
            font-size: 14px;
            color: #2c3e50;
            font-weight: 500;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        .summary-card {
            background-color: #fff;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #3498db;
        }
        .summary-card.balance {
            border-left-color: #e74c3c;
        }
        .summary-card.paid {
            border-left-color: #27ae60;
        }
        .summary-card.quoted {
            border-left-color: #f39c12;
        }
        .summary-value {
            font-size: 24px;
            font-weight: bold;
            color: #2c3e50;
        }
        .summary-label {
            font-size: 12px;
            text-transform: uppercase;
            color: #7f8c8d;
            margin-bottom: 5px;
        }
        .table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        .table th,
        .table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ecf0f1;
        }
        .table th {
            background-color: #34495e;
            color: white;
            font-weight: 600;
        }
        .table tr:hover {
            background-color: #f8f9fa;
        }
        .communication-type {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
            background-color: #3498db;
            color: white;
        }
        .financial-type {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .financial-type.quote {
            background-color: #f39c12;
            color: white;
        }
        .financial-type.payment {
            background-color: #27ae60;
            color: white;
        }
        .financial-type.adjustment {
            background-color: #9b59b6;
            color: white;
        }
        .amount {
            font-weight: bold;
        }
        .amount.positive {
            color: #e74c3c;
        }
        .amount.negative {
            color: #27ae60;
        }
        .footer {
            margin-top: 50px;
            text-align: center;
            color: #7f8c8d;
            font-size: 14px;
        }
        .no-data {
            color: #7f8c8d;
            font-style: italic;
            text-align: center;
            padding: 20px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${reportTitle}</h1>
        <div class="date">Report Date: ${reportDate}</div>
    </div>

    <div class="section">
        <h2>Client Information</h2>
        <div class="info-grid">
            <div class="info-item">
                <div class="label">Client Name</div>
                <div class="value">${clientInfo.client_name}</div>
            </div>
            <div class="info-item">
                <div class="label">Client ID</div>
                <div class="value">${clientInfo.id}</div>
            </div>
            ${clientInfo.client_type ? `<div class="info-item">
                <div class="label">Client Type</div>
                <div class="value">${clientInfo.client_type}</div>
            </div>` : ''}
            ${clientInfo.email ? `<div class="info-item">
                <div class="label">Email</div>
                <div class="value">${clientInfo.email}</div>
            </div>` : ''}
            ${clientInfo.phone ? `<div class="info-item">
                <div class="label">Phone</div>
                <div class="value">${clientInfo.phone}</div>
            </div>` : ''}
            ${clientInfo.address ? `<div class="info-item">
                <div class="label">Address</div>
                <div class="value">${clientInfo.address}</div>
            </div>` : ''}
            ${clientInfo.date_intake ? `<div class="info-item">
                <div class="label">Date of Intake</div>
                <div class="value">${formatDate(clientInfo.date_intake)}</div>
            </div>` : ''}
            ${clientInfo.date_of_birth ? `<div class="info-item">
                <div class="label">Date of Birth</div>
                <div class="value">${formatDate(clientInfo.date_of_birth)}</div>
            </div>` : ''}
            ${clientInfo.county ? `<div class="info-item">
                <div class="label">County</div>
                <div class="value">${clientInfo.county}</div>
            </div>` : ''}
            ${clientInfo.court_date ? `<div class="info-item">
                <div class="label">Court Date</div>
                <div class="value">${formatDate(clientInfo.court_date)}</div>
            </div>` : ''}
            <div class="info-item">
                <div class="label">Client Since</div>
                <div class="value">${formatDate(clientInfo.created_at)}</div>
            </div>
            <div class="info-item">
                <div class="label">Last Updated</div>
                <div class="value">${formatDate(clientInfo.updated_at)}</div>
            </div>
        </div>
        
        ${clientInfo.client_type === 'criminal' ? `<div class="info-grid" style="margin-top: 20px;">
            <div class="info-item">
                <div class="label">Arrested</div>
                <div class="value">${clientInfo.arrested ? 'Yes' : 'No'}</div>
            </div>
            ${clientInfo.charges ? `<div class="info-item">
                <div class="label">Charges</div>
                <div class="value">${clientInfo.charges}</div>
            </div>` : ''}
        </div>` : ''}
        
        ${clientInfo.client_type === 'civil' ? `<div class="info-grid" style="margin-top: 20px;">
            ${clientInfo.case_type ? `<div class="info-item">
                <div class="label">Case Type</div>
                <div class="value">${clientInfo.case_type}</div>
            </div>` : ''}
            ${clientInfo.served_papers_or_initial_filing ? `<div class="info-item">
                <div class="label">Filing Status</div>
                <div class="value">${clientInfo.served_papers_or_initial_filing}</div>
            </div>` : ''}
        </div>` : ''}
        
        ${clientInfo.contact_1 ? `<div class="info-grid" style="margin-top: 20px;">
            ${clientInfo.contact_1 ? `<div class="info-item">
                <div class="label">Emergency Contact 1</div>
                <div class="value">${clientInfo.contact_1} (${clientInfo.relationship_1 || 'Contact'})</div>
            </div>` : ''}
            ${clientInfo.contact_1_phone ? `<div class="info-item">
                <div class="label">Contact 1 Phone</div>
                <div class="value">${clientInfo.contact_1_phone}</div>
            </div>` : ''}
            ${clientInfo.contact_2 ? `<div class="info-item">
                <div class="label">Emergency Contact 2</div>
                <div class="value">${clientInfo.contact_2} (${clientInfo.relationship_2 || 'Contact'})</div>
            </div>` : ''}
            ${clientInfo.contact_2_phone ? `<div class="info-item">
                <div class="label">Contact 2 Phone</div>
                <div class="value">${clientInfo.contact_2_phone}</div>
            </div>` : ''}
        </div>` : ''}
        
        ${clientInfo.notes ? `<div style="margin-top: 20px;">
            <div class="info-item">
                <div class="label">Notes</div>
                <div class="value">${clientInfo.notes}</div>
            </div>
        </div>` : ''}
    </div>

    <div class="section">
        <h2>Financial Summary</h2>
        <div class="summary-grid">
            <div class="summary-card quoted">
                <div class="summary-label">Total Quoted</div>
                <div class="summary-value">${formatCurrency(financialSummary.total_quoted)}</div>
            </div>
            <div class="summary-card paid">
                <div class="summary-label">Total Paid</div>
                <div class="summary-value">${formatCurrency(financialSummary.total_paid)}</div>
            </div>
            <div class="summary-card balance">
                <div class="summary-label">Outstanding Balance</div>
                <div class="summary-value">${formatCurrency(financialSummary.balance)}</div>
            </div>
            <div class="summary-card">
                <div class="summary-label">Transaction Count</div>
                <div class="summary-value">${financialSummary.transaction_count}</div>
            </div>
        </div>
        ${financialSummary.last_payment_date || financialSummary.payment_methods.length > 0 ? `<div class="info-grid" style="margin-top: 20px;">
            ${financialSummary.last_payment_date ? `<div class="info-item">
                <div class="label">Last Payment Date</div>
                <div class="value">${formatDate(financialSummary.last_payment_date)}</div>
            </div>` : ''}
            ${financialSummary.payment_methods.length > 0 ? `<div class="info-item">
                <div class="label">Payment Methods Used</div>
                <div class="value">${financialSummary.payment_methods.join(', ')}</div>
            </div>` : ''}
        </div>` : ''}
    </div>

    ${financialSummary.recent_transactions.length > 0 ? `<div class="section">
        <h2>Recent Financial Transactions</h2>
        <table class="table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Payment Method</th>
                    <th>Service Description</th>
                    <th>Case Number</th>
                </tr>
            </thead>
            <tbody>
                ${financialSummary.recent_transactions.map(transaction => `<tr>
                    <td>${formatDate(transaction.transaction_date)}</td>
                    <td><span class="financial-type ${transaction.transaction_type}">${transaction.transaction_type}</span></td>
                    <td><span class="amount ${transaction.transaction_type === 'payment' ? 'negative' : 'positive'}">${formatCurrency(transaction.amount)}</span></td>
                    <td>${transaction.payment_method || '-'}</td>
                    <td>${transaction.service_description || '-'}</td>
                    <td>${transaction.case_number || '-'}</td>
                </tr>`).join('')}
            </tbody>
        </table>
    </div>` : ''}

    ${financialSummary.outstanding_payments.length > 0 ? `<div class="section">
        <h2>Outstanding Payments</h2>
        <table class="table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Service Description</th>
                    <th>Case Number</th>
                </tr>
            </thead>
            <tbody>
                ${financialSummary.outstanding_payments.map(payment => `<tr>
                    <td>${formatDate(payment.transaction_date)}</td>
                    <td><span class="amount positive">${formatCurrency(payment.amount)}</span></td>
                    <td>${payment.service_description || '-'}</td>
                    <td>${payment.case_number || '-'}</td>
                </tr>`).join('')}
            </tbody>
        </table>
    </div>` : ''}

    ${includeCommunicationHistory && communications.length > 0 ? `<div class="section">
        <h2>Communication History</h2>
        <table class="table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Subject</th>
                    <th>Notes</th>
                </tr>
            </thead>
            <tbody>
                ${communications.map(communication => `<tr>
                    <td>${formatDate(communication.communication_date)}</td>
                    <td><span class="communication-type">${communication.communication_type.replace('_', ' ')}</span></td>
                    <td>${communication.subject || '-'}</td>
                    <td>${communication.notes ? communication.notes.substring(0, 100) + (communication.notes.length > 100 ? '...' : '') : '-'}</td>
                </tr>`).join('')}
            </tbody>
        </table>
    </div>` : includeCommunicationHistory ? `<div class="section">
        <h2>Communication History</h2>
        <div class="no-data">No communication records found for this client.</div>
    </div>` : ''}

    <div class="footer">
        <p>This client report was generated on ${reportDate}.</p>
        <p>For questions about this report, please contact your account manager.</p>
    </div>
</body>
</html>`;
}

export const clientReportDocumentHandler = createDocumentHandler<"client-report">({
  kind: "client-report",
  onCreateDocument: async ({ id, title, dataStream, session }) => {
    console.log('📄 CLIENT REPORT HANDLER: onCreateDocument called', { id, title, session: !!session });

    // Extract client name from title (format: "Client Report - ClientName")
    const clientNameMatch = title.match(/Client Report - (.+)/);
    const clientName = clientNameMatch ? clientNameMatch[1] : "Unknown Client";
    console.log('📄 CLIENT REPORT HANDLER: Extracted client name:', clientName);

    // For client reports, the content should be the same as what was streamed
    // Generate the full content here as well for database storage
    console.log('📄 CLIENT REPORT HANDLER: Document handler called for:', title);

    // Generate the complete client report content for database storage
    const fullContent = await generateClientReportContentWithoutStreaming({
      clientName
    });

    console.log('📄 CLIENT REPORT HANDLER: Returning full content for database storage');
    return fullContent;
  },
  onUpdateDocument: async ({ document, description, dataStream }) => {
    // For client reports, we could implement editing capabilities here
    let draftContent = document.content || '';

    // For now, just return the existing content
    // In a real implementation, you might want to use AI to modify the report
    return draftContent;
  },
});