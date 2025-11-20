import { auth } from "@/app/(auth)/auth";
import { ChatSDKError } from "@/lib/errors";
import { getDocumentById } from "@/lib/db/queries";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType } from "docx";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { findBestClientMatch } from "@/lib/utils/client-search";

// Helper function to extract client name from HTML
function extractClientNameFromHTML(htmlContent: string): string | null {
  const clientNameMatch = htmlContent.match(/<div class="label">Client Name<\/div>\s*<div class="value">([^<]+)<\/div>/);
  return clientNameMatch ? clientNameMatch[1].trim() : null;
}

// Helper function to get comprehensive client data from database
async function getComprehensiveClientData(clientName: string) {
  try {
    // Validate environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Database configuration error: Missing Supabase credentials');
    }

    // Create Supabase client
    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

    // Find the client by name (allow partial/fuzzy match)
    const matchedClient = await findBestClientMatch(supabase, clientName);

    if (!matchedClient) {
      throw new Error(`Client "${clientName}" not found in database`);
    }

    const client = matchedClient;
    console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: Found client with all fields:', Object.keys(client));

    // Get communications
    let { data: communicationsData, error: communicationsError } = await supabase
      .from('communications')
      .select('id, communication_date, communication_type, subject, notes')
      .eq('client_id', client.id)
      .order('communication_date', { ascending: false });

    const communications = (communicationsData || []).map((comm: any) => ({
      date: comm.communication_date || 'N/A',
      type: comm.communication_type || 'Unknown',
      subject: comm.subject || 'No Subject',
      notes: comm.notes || 'No Notes',
      typeColor: getCommunicationTypeColor(comm.communication_type || ''),
    }));

    // Get financials
    let { data: financialsData, error: financialsError } = await supabase
      .from('financials')
      .select('*')
      .eq('client_id', client.id)
      .order('transaction_date', { ascending: false });

    const financialData = (financialsData || []).map((fin: any) => ({
      date: fin.transaction_date || 'N/A',
      type: fin.transaction_type || 'Unknown',
      amount: Number(fin.amount) || 0,
      paymentMethod: fin.payment_method,
      serviceDescription: fin.service_description,
    }));

    // Calculate financial summary
    const totalQuoted = financialData
      .filter(t => t.type === 'quote')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalPaid = financialData
      .filter(t => t.type === 'payment' || t.type === 'adjustment')
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      clientName: client.client_name,
      clientId: client.id,
      email: client.email || null,
      phone: client.phone || null,
      address: client.address || null,
      clientSince: client.created_at ? new Date(client.created_at).toLocaleDateString() : 'N/A',
      lastUpdated: client.updated_at ? new Date(client.updated_at).toLocaleDateString() : 'N/A',
      // Basic client information
      dateIntake: client.date_intake || null,
      dateOfBirth: client.date_of_birth || null,
      clientType: client.client_type || null,
      county: client.county || null,
      courtDate: client.court_date || null,
      // Emergency Contacts
      contact1: client.contact_1 || null,
      contact1Relationship: client.relationship_1 || null,
      contact1Phone: client.contact_1_phone || null,
      contact2: client.contact_2 || null,
      contact2Relationship: client.relationship_2 || null,
      contact2Phone: client.contact_2_phone || null,
      notes: client.notes || null,
      // Financial Information
      quoted: client.quoted || null,
      initialPayment: client.initial_payment || null,
      dueDateBalance: client.due_date_balance || null,
      // Criminal-specific fields
      arrested: client.arrested || false,
      arrestedCounty: client.arrested_county || null,
      currentlyIncarcerated: client.currently_incarcerated || false,
      incarcerationLocation: client.incarceration_location || null,
      incarcerationReason: client.incarceration_reason || null,
      lastBondHearingDate: client.last_bond_hearing_date || null,
      lastBondHearingLocation: client.last_bond_hearing_location || null,
      dateOfIncident: client.date_of_incident || null,
      incidentCounty: client.incident_county || null,
      onProbation: client.on_probation || false,
      probationCounty: client.probation_county || null,
      probationOfficer: client.probation_officer || null,
      probationTimeLeft: client.probation_time_left || null,
      onParole: client.on_parole || false,
      paroleOfficer: client.parole_officer || null,
      paroleTimeLeft: client.parole_time_left || null,
      arrestReason: client.arrest_reason || null,
      charges: client.charges || null,
      // Civil-specific fields
      servedPapersOrInitialFiling: client.served_papers_or_initial_filing || null,
      caseType: client.case_type || null,
      otherSideName: client.other_side_name || null,
      otherSideRelation: client.other_side_relation || null,
      otherSideContactInfo: client.other_side_contact_info || null,
      otherSideAttorneyInfo: client.other_side_attorney_info || null,
      // Custody-specific fields
      childrenInvolved: client.children_involved || false,
      childrenDetails: client.children_details || null,
      previousCourtOrders: client.previous_court_orders || false,
      previousOrdersCounty: client.previous_orders_county || null,
      previousOrdersCaseNumber: client.previous_orders_case_number || null,
      communications,
      financialSummary: {
        totalQuoted,
        totalPaid,
        balance: totalQuoted - totalPaid,
        transactionCount: financialData.length,
      },
      recentTransactions: financialData,
    };
  } catch (error) {
    console.error('Error getting comprehensive client data:', error);
    throw error;
  }
}

// Helper function to get communication type color
function getCommunicationTypeColor(type: string): string {
  const typeLower = type.toLowerCase();
  if (typeLower.includes('email')) return '3498db';
  if (typeLower.includes('phone')) return 'e67e22';
  if (typeLower.includes('meeting')) return '27ae60';
  if (typeLower.includes('note')) return '8e44ad';
  if (typeLower.includes('other')) return '8e44ad';
  return '000000';
}

// Helper function to get client data from HTML (fallback)
async function getClientDataFromHTML(htmlContent: string) {
  return parseClientReportHTML(htmlContent);
}

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const { htmlContent, clientName, reportDate, documentId, reportTitle } = await request.json();

    console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: Received request with', { clientName, documentId });

    let clientData = null;

    if (documentId) {
      // Get comprehensive data directly from database
      try {
        const document = await getDocumentById({ id: documentId });
        if (!document) {
          return new ChatSDKError("bad_request:api").toResponse();
        }

        // Extract client name from document content
        const extractedClientName = clientName || extractClientNameFromHTML(document.content) || 'Unknown Client';
        
        clientData = await getComprehensiveClientData(extractedClientName);
        console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: Retrieved comprehensive client data:', clientData);
        
      } catch (error) {
        console.error('Database approach failed, falling back to HTML parsing:', error);
        // Fallback to HTML parsing
        clientData = parseClientReportHTML(htmlContent);
      }
      
    } else if (htmlContent) {
      // Parse HTML if database approach fails
      clientData = parseClientReportHTML(htmlContent);
      console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: Parsed client data from HTML:', clientData);
    } else {
      return new ChatSDKError("bad_request:api").toResponse();
    }

    // Create a proper Word document with professional formatting
    const doc = new Document({
      styles: {
        paragraphStyles: [
          {
            id: "heading1",
            name: "Heading 1",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
              size: 32,
              bold: true,
            },
            paragraph: {
              spacing: {
                after: 200,
              },
            },
          },
          {
            id: "clientInfo",
            name: "Client Info",
            basedOn: "Normal",
            next: "Normal",
            quickFormat: true,
            run: {
              size: 24,
            },
            paragraph: {
              spacing: {
                after: 100,
              },
            },
          },
        ],
      },
      sections: [
        {
          properties: {},
          children: [
            // Title
            new Paragraph({
              children: [
                new TextRun({
                  text: reportTitle || `Client Report${clientData.clientName ? ` - ${clientData.clientName}` : ''}`,
                  bold: true,
                  size: 32,
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: {
                after: 400,
              },
            }),

            // Date
            new Paragraph({
              children: [
                new TextRun({
                  text: `Report Date: ${reportDate || new Date().toLocaleDateString()}`,
                  italics: true,
                  size: 24,
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: {
                after: 600,
              },
            }),

            // Client Information Section
            new Paragraph({
              children: [
                new TextRun({
                  text: "CLIENT INFORMATION",
                  bold: true,
                  size: 26,
                }),
              ],
              spacing: {
                before: 400,
                after: 200,
              },
            }),

            // Client details table - comprehensive client information
            new Table({
              width: {
                size: 100,
                type: WidthType.PERCENTAGE,
              },
              rows: [
                // Basic client information
                new TableRow({
                  children: [
                    new TableCell({
                      children: [new Paragraph({
                        children: [new TextRun({ text: "Client Name:", bold: true })]
                      })],
                      width: { size: 25, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                      children: [new Paragraph({
                        children: [new TextRun({ text: clientData.clientName })]
                      })],
                      width: { size: 75, type: WidthType.PERCENTAGE },
                    }),
                  ],
                }),
                ...(clientData.email ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Email:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: clientData.email })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                ...(clientData.phone ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Phone:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: clientData.phone })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                ...(clientData.address ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Address:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: clientData.address })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                ...((clientData as any).dateOfBirth ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Date of Birth:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).dateOfBirth })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                ...((clientData as any).clientType ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Client Type:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).clientType })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                ...((clientData as any).dateIntake ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Date of Intake:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).dateIntake })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                ...((clientData as any).county ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "County:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).county })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                ...((clientData as any).courtDate ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Court Date:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).courtDate })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                // Emergency Contacts
                ...((clientData as any).contact1 ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Emergency Contact 1:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).contact1 })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                ...((clientData as any).contact1Relationship ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Contact 1 Relationship:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).contact1Relationship })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                ...((clientData as any).contact1Phone ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Contact 1 Phone:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).contact1Phone })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                ...((clientData as any).contact2 ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Emergency Contact 2:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).contact2 })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                ...((clientData as any).contact2Relationship ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Contact 2 Relationship:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).contact2Relationship })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                ...((clientData as any).contact2Phone ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Contact 2 Phone:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).contact2Phone })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                // Financial Information (excluding quoted and initial payment as requested)
                ...((clientData as any).dueDateBalance && (clientData as any).dueDateBalance.toString().trim() ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Due Date for Balance:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).dueDateBalance })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                // Criminal-specific fields
                ...((clientData as any).arrested !== undefined && (clientData as any).arrested ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Arrested:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Yes" })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                ...((clientData as any).arrestedCounty ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Arrested County:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).arrestedCounty })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                ...((clientData as any).dateOfIncident ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Date of Incident:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).dateOfIncident })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                ...((clientData as any).incidentCounty ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Incident County:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).incidentCounty })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                ...((clientData as any).charges ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Charges:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).charges })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                // Civil-specific fields
                ...((clientData as any).caseType ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Case Type:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).caseType })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                ...((clientData as any).otherSideName ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Other Side Name:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).otherSideName })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                ...((clientData as any).otherSideContactInfo ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Other Side Contact Info:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).otherSideContactInfo })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                ...((clientData as any).otherSideAttorneyInfo ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Other Side Attorney Info:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).otherSideAttorneyInfo })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                // Custody-specific fields
                ...((clientData as any).childrenInvolved !== undefined && (clientData as any).childrenInvolved ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Children Involved:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Yes" })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                ...((clientData as any).childrenInvolved && (clientData as any).childrenDetails ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Children Details:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).childrenDetails })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                ...((clientData as any).previousCourtOrders !== undefined && (clientData as any).previousCourtOrders ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Previous Court Orders:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Yes" })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                ...((clientData as any).previousCourtOrders && (clientData as any).previousOrdersCounty ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Previous Orders County:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).previousOrdersCounty })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                ...((clientData as any).previousCourtOrders && (clientData as any).previousOrdersCaseNumber ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Previous Orders Case Number:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).previousOrdersCaseNumber })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
                // Notes
                ...((clientData as any).notes ? [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Notes:", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: (clientData as any).notes })]
                        })],
                        width: { size: 75, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })
                ] : []),
              ],
            }),

            // Financial Summary Section
            ...(clientData.financialSummary && clientData.financialSummary.transactionCount > 0 ? [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "FINANCIAL SUMMARY",
                    bold: true,
                    size: 26,
                  }),
                ],
                spacing: {
                  before: 400,
                  after: 200,
                },
              }),

              // Financial summary table
              new Table({
                width: {
                  size: 100,
                  type: WidthType.PERCENTAGE,
                },
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Total Quoted:", bold: true })]
                        })],
                        width: { size: 40, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: `$${clientData.financialSummary.totalQuoted.toFixed(2)}` })]
                        })],
                        width: { size: 60, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  }),
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Total Paid:", bold: true })]
                        })],
                        width: { size: 40, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: `$${clientData.financialSummary.totalPaid.toFixed(2)}` })]
                        })],
                        width: { size: 60, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  }),
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Outstanding Balance:", bold: true })]
                        })],
                        width: { size: 40, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: `$${clientData.financialSummary.balance.toFixed(2)}` })]
                        })],
                        width: { size: 60, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  }),
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Transaction Count:", bold: true })]
                        })],
                        width: { size: 40, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: clientData.financialSummary.transactionCount.toString() })]
                        })],
                        width: { size: 60, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  }),
                ],
              }),

              // Recent Transactions Section
              ...(clientData.recentTransactions && clientData.recentTransactions.length > 0 ? [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "RECENT TRANSACTIONS",
                      bold: true,
                      size: 22,
                    }),
                  ],
                  spacing: {
                    before: 300,
                    after: 200,
                  },
                }),

                new Table({
                  width: {
                    size: 100,
                    type: WidthType.PERCENTAGE,
                  },
                  rows: [
                    // Header row
                    new TableRow({
                      children: [
                        new TableCell({
                          children: [new Paragraph({
                            children: [new TextRun({ text: "Date", bold: true })]
                          })],
                          width: { size: 20, type: WidthType.PERCENTAGE },
                        }),
                        new TableCell({
                          children: [new Paragraph({
                            children: [new TextRun({ text: "Type", bold: true })]
                          })],
                          width: { size: 20, type: WidthType.PERCENTAGE },
                        }),
                        new TableCell({
                          children: [new Paragraph({
                            children: [new TextRun({ text: "Amount", bold: true })]
                          })],
                          width: { size: 20, type: WidthType.PERCENTAGE },
                        }),
                        new TableCell({
                          children: [new Paragraph({
                            children: [new TextRun({ text: "Service Description", bold: true })]
                          })],
                          width: { size: 40, type: WidthType.PERCENTAGE },
                        }),
                      ],
                    }),

                    // Transaction rows
                    ...clientData.recentTransactions.slice(0, 10).map((transaction: any) => new TableRow({
                      children: [
                        new TableCell({
                          children: [new Paragraph({
                            children: [new TextRun({ text: transaction.date })]
                          })],
                          width: { size: 20, type: WidthType.PERCENTAGE },
                        }),
                        new TableCell({
                          children: [new Paragraph({
                            children: [new TextRun({ text: transaction.type })]
                          })],
                          width: { size: 20, type: WidthType.PERCENTAGE },
                        }),
                        new TableCell({
                          children: [new Paragraph({
                            children: [new TextRun({ text: `$${transaction.amount.toFixed(2)}` })]
                          })],
                          width: { size: 20, type: WidthType.PERCENTAGE },
                        }),
                        new TableCell({
                          children: [new Paragraph({
                            children: [new TextRun({ text: transaction.serviceDescription || '-' })]
                          })],
                          width: { size: 40, type: WidthType.PERCENTAGE },
                        }),
                      ],
                    })),
                  ],
                }),
              ] : []),
            ] : []),

            // Communication History Section (if communications exist)
            ...(clientData.communications && clientData.communications.length > 0 ? [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "COMMUNICATION HISTORY",
                    bold: true,
                    size: 26,
                  }),
                ],
                spacing: {
                  before: 400,
                  after: 300,
                },
              }),

              // Communication table
              new Table({
                width: {
                  size: 100,
                  type: WidthType.PERCENTAGE,
                },
                rows: [
                  // Header row
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Date", bold: true })]
                        })],
                        width: { size: 20, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Type", bold: true })]
                        })],
                        width: { size: 20, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Subject", bold: true })]
                        })],
                        width: { size: 30, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Notes", bold: true })]
                        })],
                        width: { size: 30, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  }),

                  // Communication rows
                  ...clientData.communications.map((communication: any) => new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: communication.date })]
                        })],
                        width: { size: 20, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({
                            text: communication.type,
                            color: communication.typeColor
                          })]
                        })],
                        width: { size: 20, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: communication.subject })]
                        })],
                        width: { size: 30, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: communication.notes })]
                        })],
                        width: { size: 30, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  })),
                ],
              }),
            ] : []),

            // Footer
            new Paragraph({
              children: [
                new TextRun({
                  text: `This client report was generated on ${new Date().toLocaleDateString()}. For questions about this report, please contact your account manager.`,
                  size: 20,
                  italics: true,
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: {
                before: 400,
              },
            }),
          ],
        },
      ],
    });

    // Generate the Word document buffer
    const buffer = await Packer.toBuffer(doc);

    // Return the Word document as a downloadable file
    return new Response(buffer as any, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${clientName ? `client-report-${clientName}` : 'client-report'}.docx"`,
      },
    });

  } catch (error) {
    console.error('Error generating client report document:', error);
    return new ChatSDKError("bad_request:api").toResponse();
  }
}

// Helper function to parse client report HTML and extract data
function parseClientReportHTML(htmlContent: string) {
  console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: Parsing HTML content, length:', htmlContent.length);

  // Extract client name
  const clientNameMatch = htmlContent.match(/<div class="label">Client Name<\/div>\s*<div class="value">([^<]+)<\/div>/);
  const clientName = clientNameMatch ? clientNameMatch[1].trim() : 'Unknown Client';
  console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: Extracted client name:', clientName);

  // Extract client ID
  const clientIdMatch = htmlContent.match(/<div class="label">Client ID<\/div>\s*<div class="value">([^<]+)<\/div>/);
  const clientId = clientIdMatch ? clientIdMatch[1].trim() : 'N/A';
  console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: Extracted client ID:', clientId);

  // Extract email
  const emailMatch = htmlContent.match(/<div class="label">Email<\/div>\s*<div class="value">([^<]+)<\/div>/);
  const email = emailMatch ? emailMatch[1].trim() : null;

  // Extract phone
  const phoneMatch = htmlContent.match(/<div class="label">Phone<\/div>\s*<div class="value">([^<]+)<\/div>/);
  const phone = phoneMatch ? phoneMatch[1].trim() : null;

  // Extract address
  const addressMatch = htmlContent.match(/<div class="label">Address<\/div>\s*<div class="value">([^<]+)<\/div>/);
  const address = addressMatch ? addressMatch[1].trim() : null;

  // Extract client since
  const clientSinceMatch = htmlContent.match(/<div class="label">Client Since<\/div>\s*<div class="value">([^<]+)<\/div>/);
  const clientSince = clientSinceMatch ? clientSinceMatch[1].trim() : 'N/A';

  // Extract last updated
  const lastUpdatedMatch = htmlContent.match(/<div class="label">Last Updated<\/div>\s*<div class="value">([^<]+)<\/div>/);
  const lastUpdated = lastUpdatedMatch ? lastUpdatedMatch[1].trim() : 'N/A';

  // Extract communications from HTML table
  const communications: Array<{
    date: string;
    type: string;
    subject: string;
    notes: string;
    typeColor: string;
  }> = [];

  // Look for communication table in the Communication History section specifically
  const communicationSectionMatch = htmlContent.match(/<div class="section">[\s\S]*?<h2>Communication History<\/h2>[\s\S]*?<table class="table">[\s\S]*?<tbody>(.*?)<\/tbody>[\s\S]*?<\/table>[\s\S]*?<\/div>/);
  
  if (communicationSectionMatch) {
    const tbodyContent = communicationSectionMatch[1];
    console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: Communication tbody content:', tbodyContent);
    
    // Use a more flexible regex pattern that can handle whitespace and newlines
    const rowMatches = tbodyContent.match(/<tr[\s\S]*?>([\s\S]*?)<\/tr>/gi);
    console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: Communication row matches:', rowMatches);

    if (rowMatches) {
      for (let i = 0; i < rowMatches.length; i++) {
        const row = rowMatches[i];
        console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: Processing communication row:', row);
        
        // Use a more flexible regex pattern for cells that can handle whitespace and newlines
        const cells = row.match(/<td[\s\S]*?>([\s\S]*?)<\/td>/gi);
        console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: Communication cells:', cells);

        if (cells && cells.length >= 4) {
          // Extract text content from cells, handling the new regex pattern
          const date = cells[0].replace(/<[^>]*>/g, '').trim();
          const type = cells[1].replace(/<[^>]*>/g, '').trim();
          const subject = cells[2].replace(/<[^>]*>/g, '').trim();
          const notes = cells[3].replace(/<[^>]*>/g, '').trim();

          console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: Parsed communication:', { date, type, subject, notes });

          // Determine colors based on communication type
          let typeColor = '000000';

          if (type.toLowerCase().includes('email')) {
            typeColor = '3498db';
          } else if (type.toLowerCase().includes('phone')) {
            typeColor = 'e67e22';
          } else if (type.toLowerCase().includes('meeting')) {
            typeColor = '27ae60';
          } else if (type.toLowerCase().includes('note')) {
            typeColor = '8e44ad';
          } else if (type.toLowerCase().includes('other')) {
            typeColor = '8e44ad';
          }

          communications.push({
            date,
            type,
            subject,
            notes,
            typeColor,
          });
        }
      }
    }
  } else {
    console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: No communication table found in Communication History section');
  }

  console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: Extracted communications:', communications.length);
  console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: Communication details:', communications);

  // Try to extract financial data from HTML (if present)
  const financialSummary = {
    totalQuoted: 0,
    totalPaid: 0,
    balance: 0,
    transactionCount: 0,
  };

  const recentTransactions: Array<{
    date: string;
    type: string;
    amount: number;
    paymentMethod?: string;
    serviceDescription?: string;
  }> = [];

  // Extract financial summary values from HTML
  const totalQuotedMatch = htmlContent.match(/Total Quoted.*?\$([0-9,]+\.[0-9]{2})/);
  if (totalQuotedMatch) {
    financialSummary.totalQuoted = parseFloat(totalQuotedMatch[1].replace(',', ''));
  }

  const totalPaidMatch = htmlContent.match(/Total Paid.*?\$([0-9,]+\.[0-9]{2})/);
  if (totalPaidMatch) {
    financialSummary.totalPaid = parseFloat(totalPaidMatch[1].replace(',', ''));
  }

  const balanceMatch = htmlContent.match(/Outstanding Balance.*?\$([0-9,]+\.[0-9]{2})/);
  if (balanceMatch) {
    financialSummary.balance = parseFloat(balanceMatch[1].replace(',', ''));
  }

  const transactionCountMatch = htmlContent.match(/Transaction Count.*?([0-9]+)/);
  if (transactionCountMatch) {
    financialSummary.transactionCount = parseInt(transactionCountMatch[1]);
  }

  return {
    clientName,
    clientId,
    email,
    phone,
    address,
    clientSince,
    lastUpdated,
    communications,
    financialSummary,
    recentTransactions,
  };
}
