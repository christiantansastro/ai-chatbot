import { createDocumentHandler } from "@/lib/artifacts/server";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { UIMessageStreamWriter } from "ai";
import type { ChatMessage } from "@/lib/types";

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

    // Get communication history
    console.log('📄 CLIENT REPORT SERVER: Getting communication history...');

    let communications: any[] = [];
    let query = supabase
      .from('communications')
      .select('*')
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
      communications = communicationsData || [];
    }

    // Format client info
    const clientInfo = {
      id: client.id || 'standalone',
      name: client.client_name,
      email: client.email,
      phone: client.phone,
      address: client.address,
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
  reportDate,
  reportTitle,
  includeCommunicationHistory
}: {
  clientInfo: any;
  communications: any[];
  reportDate: string;
  reportTitle: string;
  includeCommunicationHistory: boolean;
}) {
  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('en-US');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${reportTitle} - ${clientInfo.name}</title>
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
            .communications {
                margin-top: 40px;
            }
            .communications h2 {
                color: #2c3e50;
                border-bottom: 1px solid #bdc3c7;
                padding-bottom: 10px;
            }
            .communication-table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 20px;
            }
            .communication-table th,
            .communication-table td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid #ecf0f1;
            }
            .communication-table th {
                background-color: #34495e;
                color: white;
                font-weight: 600;
            }
            .communication-table tr:hover {
                background-color: #f8f9fa;
            }
            .communication-type {
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: bold;
                text-transform: uppercase;
            }
            .communication-type.email {
                background-color: #3498db;
                color: white;
            }
            .communication-type.phone {
                background-color: #e67e22;
                color: white;
            }
            .communication-type.meeting {
                background-color: #27ae60;
                color: white;
            }
            .communication-type.note {
                background-color: #8e44ad;
                color: white;
            }
            .direction {
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 11px;
                font-weight: bold;
                text-transform: uppercase;
            }
            .direction.inbound {
                background-color: #27ae60;
                color: white;
            }
            .direction.outbound {
                background-color: #3498db;
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
            <h1>${reportTitle}</h1>
            <div class="date">Report Date: ${reportDate}</div>
        </div>

        <div class="client-info">
            <h2>Client Information</h2>
            <div class="info-grid">
                <div class="info-item">
                    <div class="label">Client Name</div>
                    <div class="value">${clientInfo.name}</div>
                </div>
                <div class="info-item">
                    <div class="label">Client ID</div>
                    <div class="value">${clientInfo.id}</div>
                </div>
                ${clientInfo.email ? `
                <div class="info-item">
                    <div class="label">Email</div>
                    <div class="value">${clientInfo.email}</div>
                </div>
                ` : ''}
                ${clientInfo.phone ? `
                <div class="info-item">
                    <div class="label">Phone</div>
                    <div class="value">${clientInfo.phone}</div>
                </div>
                ` : ''}
                ${clientInfo.address ? `
                <div class="info-item">
                    <div class="label">Address</div>
                    <div class="value">${clientInfo.address}</div>
                </div>
                ` : ''}
                <div class="info-item">
                    <div class="label">Client Since</div>
                    <div class="value">${formatDate(clientInfo.created_at)}</div>
                </div>
                <div class="info-item">
                    <div class="label">Last Updated</div>
                    <div class="value">${formatDate(clientInfo.updated_at)}</div>
                </div>
            </div>
        </div>

        ${includeCommunicationHistory && communications.length > 0 ? `
        <div class="communications">
            <h2>Communication History</h2>
            <table class="communication-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Direction</th>
                        <th>Subject</th>
                        <th>Content</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${communications.map(communication => `
                    <tr>
                        <td>${formatDate(communication.communication_date)}</td>
                        <td><span class="communication-type ${communication.communication_type}">${communication.communication_type}</span></td>
                        <td><span class="direction ${communication.direction}">${communication.direction}</span></td>
                        <td>${communication.subject || '-'}</td>
                        <td>${communication.content ? communication.content.substring(0, 100) + (communication.content.length > 100 ? '...' : '') : '-'}</td>
                        <td>${communication.status || '-'}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        ` : ''}

        <div class="footer">
            <p>This client report was generated on ${reportDate}.</p>
            <p>For questions about this report, please contact your account manager.</p>
        </div>
    </body>
    </html>
  `;
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