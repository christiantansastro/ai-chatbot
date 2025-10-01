import { tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  artifactKinds,
  documentHandlersByArtifactKind,
} from "@/lib/artifacts/server";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

interface ClientCommunication {
  id: string;
  communication_type: string;
  subject?: string;
  content?: string;
  communication_date: string;
  direction: string;
  status?: string;
}

interface ClientInfo {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  created_at: string;
  updated_at: string;
}

type CreateClientReportProps = {
  session: any;
  dataStream: UIMessageStreamWriter<ChatMessage>;
};

async function generateClientReportContent({
  clientName,
  includeCommunicationHistory,
  reportDate,
  reportTitle,
  dataStream
}: {
  clientName: string;
  includeCommunicationHistory: boolean;
  reportDate?: string;
  reportTitle: string;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}): Promise<string> {
  try {
    console.log('📄 CLIENT REPORT TOOL: Generating report for:', clientName);

    // Validate environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ CLIENT REPORT TOOL: Missing Supabase environment variables');
      throw new Error('Database configuration error: Missing Supabase credentials');
    }

    // Create Supabase client
    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

    // Find the client by name
    console.log('📄 CLIENT REPORT TOOL: Finding client...');

    // First try to find in clients table
    let { data: clients, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .ilike('client_name', clientName)
      .limit(1);

    if (clientError || !clients || clients.length === 0) {
      console.log('❌ CLIENT REPORT TOOL: Client not found:', clientName);
      throw new Error(`Client "${clientName}" not found. Please check the name and try again.`);
    }

    const client = clients[0];
    console.log('✅ CLIENT REPORT TOOL: Found client:', client.client_name);

    // Get communication history if requested
    let communications: ClientCommunication[] = [];
    if (includeCommunicationHistory) {
      console.log('📄 CLIENT REPORT TOOL: Getting communication history...');

      let query = supabase
        .from('communications')
        .select('*')
        .order('communication_date', { ascending: false })
        .order('created_at', { ascending: false });

      // Add client filter based on what's available
      if (client.id) {
        query = query.eq('client_id', client.id);
      }

      const { data: communicationsData, error: communicationsError } = await query;

      if (communicationsError) {
        console.warn('⚠️ CLIENT REPORT TOOL: Could not get communication history:', communicationsError);
      } else {
        communications = communicationsData || [];
      }
    }

    // Format client info
    const clientInfo: ClientInfo = {
      id: client.id || 'standalone',
      name: client.client_name,
      email: client.email,
      phone: client.phone,
      address: client.address,
      created_at: client.created_at,
      updated_at: client.updated_at,
    };

    // Generate the client report document
    const currentDate = reportDate ? new Date(reportDate) : new Date();
    const formattedDate = currentDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Generate HTML document content
    const documentContent = generateClientReportHTML({
      clientInfo,
      communications: includeCommunicationHistory ? communications : [],
      reportDate: formattedDate,
      reportTitle,
      includeCommunicationHistory
    });

    return documentContent;

  } catch (error) {
    console.error('❌ CLIENT REPORT TOOL: Error generating client report:', error);
    throw error;
  }
}

export const createClientReport = ({ session, dataStream }: CreateClientReportProps) =>
  tool({
    description: "Generate a professional client report document containing client information and communication history.",
    inputSchema: z.object({
      clientName: z.string().describe("Name of the client to generate the report for"),
      includeCommunicationHistory: z.boolean().optional().default(true).describe("Whether to include detailed communication history in the report"),
      reportDate: z.string().optional().describe("Date for the report (YYYY-MM-DD format). Defaults to current date"),
      reportTitle: z.string().optional().default("Client Report").describe("Title for the client report document"),
    }),
    execute: async ({
      clientName,
      includeCommunicationHistory = true,
      reportDate,
      reportTitle = "Client Report"
    }) => {
      const id = generateUUID();

      // Set the artifact kind and metadata
      dataStream.write({
        type: "data-kind",
        data: "client-report",
        transient: true,
      });

      dataStream.write({
        type: "data-id",
        data: id,
        transient: true,
      });

      dataStream.write({
        type: "data-title",
        data: `${reportTitle} - ${clientName}`,
        transient: true,
      });

      // Use the document handler to create and save the document
      const documentHandler = documentHandlersByArtifactKind.find(
        (handler) => handler.kind === "client-report"
      );

      if (!documentHandler) {
        throw new Error(`No document handler found for kind: client-report`);
      }

      // Set artifact metadata first (this triggers artifact creation)
      dataStream.write({
        type: "data-kind",
        data: "client-report",
        transient: true,
      });

      dataStream.write({
        type: "data-id",
        data: id,
        transient: true,
      });

      dataStream.write({
        type: "data-title",
        data: `${reportTitle} - ${clientName}`,
        transient: true,
      });

      // Clear any existing artifact data
      dataStream.write({
        type: "data-clear",
        data: null,
        transient: true,
      });

      // Generate the content
      const documentContent = await generateClientReportContent({
        clientName,
        includeCommunicationHistory,
        reportDate,
        reportTitle,
        dataStream
      });

      // Stream the content to the artifact
      dataStream.write({
        type: "data-textDelta",
        data: documentContent,
        transient: true,
      });

      // Save the document to database
      await documentHandler.onCreateDocument({
        id,
        title: `${reportTitle} - ${clientName}`,
        dataStream,
        session,
      });

      dataStream.write({ type: "data-finish", data: null, transient: true });

      console.log('📄 CLIENT REPORT TOOL: Client report generated for:', clientName);

      return {
        id,
        title: `${reportTitle} - ${clientName}`,
        kind: "client-report",
        content: documentContent,
        clientName,
      };
    },
  });

function generateClientReportHTML({
  clientInfo,
  communications,
  reportDate,
  reportTitle,
  includeCommunicationHistory
}: {
  clientInfo: ClientInfo;
  communications: ClientCommunication[];
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