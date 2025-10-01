import { auth } from "@/app/(auth)/auth";
import { ChatSDKError } from "@/lib/errors";
import { getDocumentById } from "@/lib/db/queries";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType } from "docx";

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const { htmlContent, clientName, reportDate, documentId, reportTitle } = await request.json();

    // If we have documentId, get the content from the database
    let content = htmlContent;
    if (!content && documentId) {
      const document = await getDocumentById({ id: documentId });
      if (document) {
        content = document.content;
      }
    }

    if (!content) {
      return new ChatSDKError("bad_request:api").toResponse();
    }

    console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: Received HTML content length:', content.length);
    console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: HTML content preview:', content.substring(0, 1000));

    // Parse the HTML content to extract client data
    const clientData = parseClientReportHTML(content);
    console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: Parsed client data:', clientData);

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
                  text: reportTitle || `Client Report${clientName ? ` - ${clientName}` : ''}`,
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

            // Client details table
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
                new TableRow({
                  children: [
                    new TableCell({
                      children: [new Paragraph({
                        children: [new TextRun({ text: "Client ID:", bold: true })]
                      })],
                      width: { size: 25, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                      children: [new Paragraph({
                        children: [new TextRun({ text: clientData.clientId })]
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
                new TableRow({
                  children: [
                    new TableCell({
                      children: [new Paragraph({
                        children: [new TextRun({ text: "Client Since:", bold: true })]
                      })],
                      width: { size: 25, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                      children: [new Paragraph({
                        children: [new TextRun({ text: clientData.clientSince })]
                      })],
                      width: { size: 75, type: WidthType.PERCENTAGE },
                    }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({
                      children: [new Paragraph({
                        children: [new TextRun({ text: "Last Updated:", bold: true })]
                      })],
                      width: { size: 25, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                      children: [new Paragraph({
                        children: [new TextRun({ text: clientData.lastUpdated })]
                      })],
                      width: { size: 75, type: WidthType.PERCENTAGE },
                    }),
                  ],
                }),
              ],
            }),

            // Communication History Section (if communications exist)
            ...(clientData.communications.length > 0 ? [
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
                        width: { size: 15, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Type", bold: true })]
                        })],
                        width: { size: 15, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Direction", bold: true })]
                        })],
                        width: { size: 15, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Subject", bold: true })]
                        })],
                        width: { size: 20, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Content", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Status", bold: true })]
                        })],
                        width: { size: 10, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  }),

                  // Communication rows
                  ...clientData.communications.map(communication => new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: communication.date })]
                        })],
                        width: { size: 15, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({
                            text: communication.type,
                            color: communication.typeColor
                          })]
                        })],
                        width: { size: 15, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({
                            text: communication.direction,
                            color: communication.directionColor
                          })]
                        })],
                        width: { size: 15, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: communication.subject })]
                        })],
                        width: { size: 20, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: communication.content })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: communication.status })]
                        })],
                        width: { size: 10, type: WidthType.PERCENTAGE },
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
    direction: string;
    subject: string;
    content: string;
    status: string;
    typeColor: string;
    directionColor: string;
  }> = [];

  // Look for communication table rows
  const tbodyMatch = htmlContent.match(/<tbody>(.*?)<\/tbody>/s);
  console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: tbodyMatch:', tbodyMatch);

  if (tbodyMatch) {
    const tbodyContent = tbodyMatch[1];
    console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: tbodyContent:', tbodyContent);
    // Use a more flexible regex pattern that can handle whitespace and newlines
    const rowMatches = tbodyContent.match(/<tr[\s\S]*?>([\s\S]*?)<\/tr>/gi);
    console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: rowMatches:', rowMatches);

    if (rowMatches) {
      for (let i = 0; i < rowMatches.length; i++) {
        const row = rowMatches[i];
        console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: Processing row:', row);
        // Use a more flexible regex pattern for cells that can handle whitespace and newlines
        const cells = row.match(/<td[\s\S]*?>([\s\S]*?)<\/td>/gi);
        console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: cells:', cells);

        if (cells && cells.length >= 6) {
          // Extract text content from cells, handling the new regex pattern
          const date = cells[0].replace(/<[^>]*>/g, '').trim();
          const type = cells[1].replace(/<[^>]*>/g, '').trim();
          const direction = cells[2].replace(/<[^>]*>/g, '').trim();
          const subject = cells[3].replace(/<[^>]*>/g, '').trim();
          const content = cells[4].replace(/<[^>]*>/g, '').trim();
          const status = cells[5].replace(/<[^>]*>/g, '').trim();

          console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: Parsed communication:', { date, type, direction, subject, content, status });

          // Determine colors based on communication type and direction
          let typeColor = '000000';
          let directionColor = '000000';

          if (type.toLowerCase().includes('email')) {
            typeColor = '3498db';
          } else if (type.toLowerCase().includes('phone')) {
            typeColor = 'e67e22';
          } else if (type.toLowerCase().includes('meeting')) {
            typeColor = '27ae60';
          } else if (type.toLowerCase().includes('note')) {
            typeColor = '8e44ad';
          }

          if (direction.toLowerCase().includes('inbound')) {
            directionColor = '27ae60';
          } else if (direction.toLowerCase().includes('outbound')) {
            directionColor = '3498db';
          }

          communications.push({
            date,
            type,
            direction,
            subject,
            content,
            status,
            typeColor,
            directionColor,
          });
        }
      }
    }
  }

  console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: Extracted communications:', communications.length);
  console.log('📄 CLIENT REPORT DOWNLOAD DEBUG: Communication details:', communications);

  return {
    clientName,
    clientId,
    email,
    phone,
    address,
    clientSince,
    lastUpdated,
    communications,
  };
}