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

    const { htmlContent, clientName, statementDate, documentId, statementTitle } = await request.json();

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

    console.log('📄 DOWNLOAD DEBUG: Received HTML content length:', content.length);
    console.log('📄 DOWNLOAD DEBUG: HTML content preview:', content.substring(0, 1000));
    console.log('📄 DOWNLOAD DEBUG: Full HTML content:', content);

    // Parse the HTML content to extract financial data
    const financialData = parseFinancialStatementHTML(content);
    console.log('📄 DOWNLOAD DEBUG: Parsed financial data:', financialData);
    console.log('📄 DOWNLOAD DEBUG: Number of transactions:', financialData.transactions.length);

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
                  text: statementTitle || `Financial Statement${clientName ? ` - ${clientName}` : ''}`,
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
                  text: `Statement Date: ${statementDate || new Date().toLocaleDateString()}`,
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
                        children: [new TextRun({ text: financialData.clientName })]
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
                        children: [new TextRun({ text: financialData.clientId })]
                      })],
                      width: { size: 75, type: WidthType.PERCENTAGE },
                    }),
                  ],
                }),
              ],
            }),

            // Financial Summary Section
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
                after: 300,
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
                        children: [new TextRun({ text: "Total Quoted", bold: true })]
                      })],
                      width: { size: 33, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                      children: [new Paragraph({
                        children: [new TextRun({ text: "Total Paid", bold: true })]
                      })],
                      width: { size: 33, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                      children: [new Paragraph({
                        children: [new TextRun({ text: "Current Balance", bold: true })]
                      })],
                      width: { size: 34, type: WidthType.PERCENTAGE },
                    }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({
                      children: [new Paragraph({
                        children: [new TextRun({
                          text: financialData.totalQuoted,
                          color: financialData.balanceColor
                        })]
                      })],
                      width: { size: 33, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                      children: [new Paragraph({
                        children: [new TextRun({
                          text: financialData.totalPaid,
                          color: "00AA00"
                        })]
                      })],
                      width: { size: 33, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                      children: [new Paragraph({
                        children: [new TextRun({
                          text: financialData.currentBalance,
                          color: financialData.balanceColor
                        })]
                      })],
                      width: { size: 34, type: WidthType.PERCENTAGE },
                    }),
                  ],
                }),
              ],
            }),

            // Transaction History Section (if transactions exist)
            ...(financialData.transactions.length > 0 ? [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "TRANSACTION HISTORY",
                    bold: true,
                    size: 26,
                  }),
                ],
                spacing: {
                  before: 400,
                  after: 300,
                },
              }),

              // Transaction table
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
                        width: { size: 12, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Type", bold: true })]
                        })],
                        width: { size: 12, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Description", bold: true })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Payment Method", bold: true })]
                        })],
                        width: { size: 15, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Amount", bold: true })]
                        })],
                        width: { size: 18, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: "Notes", bold: true })]
                        })],
                        width: { size: 18, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  }),

                  // Transaction rows
                  ...financialData.transactions.map(transaction => new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: transaction.date })]
                        })],
                        width: { size: 12, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({
                            text: transaction.type,
                            color: transaction.typeColor
                          })]
                        })],
                        width: { size: 12, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: transaction.description })]
                        })],
                        width: { size: 25, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: transaction.paymentMethod })]
                        })],
                        width: { size: 15, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({
                            text: transaction.amount,
                            color: transaction.amountColor
                          })]
                        })],
                        width: { size: 18, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: transaction.notes })]
                        })],
                        width: { size: 18, type: WidthType.PERCENTAGE },
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
                  text: `This financial statement was generated on ${new Date().toLocaleDateString()}. For questions about this statement, please contact your account manager.`,
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
        'Content-Disposition': `attachment; filename="${clientName ? `financial-statement-${clientName}` : 'financial-statement'}.docx"`,
      },
    });

  } catch (error) {
    console.error('Error generating financial statement document:', error);
    return new ChatSDKError("bad_request:api").toResponse();
  }
}

// Helper function to parse financial statement HTML and extract data
function parseFinancialStatementHTML(htmlContent: string) {
  console.log('📄 DOWNLOAD DEBUG: Parsing HTML content, length:', htmlContent.length);

  // Extract client name
  const clientNameMatch = htmlContent.match(/<p><strong>Client Name:.*?<\/strong>.*?([^<]+)<\/p>/);
  const clientName = clientNameMatch ? clientNameMatch[1].trim() : 'Unknown Client';
  console.log('📄 DOWNLOAD DEBUG: Extracted client name:', clientName);

  // Extract client ID
  const clientIdMatch = htmlContent.match(/<p><strong>Client ID:.*?<\/strong>.*?([^<]+)<\/p>/);
  const clientId = clientIdMatch ? clientIdMatch[1].trim() : 'N/A';
  console.log('📄 DOWNLOAD DEBUG: Extracted client ID:', clientId);

  // Extract financial summary - look for amount patterns
  const amountMatches = htmlContent.match(/<div class="amount">\$([0-9,]+\.?[0-9]*)/g) || [];
  console.log('📄 DOWNLOAD DEBUG: Found amount matches:', amountMatches);

  const totalQuoted = amountMatches[0] ? amountMatches[0].replace('<div class="amount">$', '$') : '$0.00';
  const totalPaid = amountMatches[1] ? amountMatches[1].replace('<div class="amount">$', '$') : '$0.00';
  const currentBalance = amountMatches[2] ? amountMatches[2].replace('<div class="amount">$', '$') : '$0.00';

  console.log('📄 DOWNLOAD DEBUG: Extracted amounts:', { totalQuoted, totalPaid, currentBalance });

  // Determine balance color (red for negative, green for positive)
  const balanceColor = currentBalance.includes('-$') ? 'FF0000' : '00AA00';

  // Extract transactions from HTML table
  const transactions: Array<{
    date: string;
    type: string;
    description: string;
    paymentMethod: string;
    amount: string;
    notes: string;
    typeColor: string;
    amountColor: string;
  }> = [];

  // Look for transaction table rows
  const tbodyMatch = htmlContent.match(/<tbody>(.*?)<\/tbody>/s);
  console.log('📄 DOWNLOAD DEBUG: tbodyMatch:', tbodyMatch);
  
  if (tbodyMatch) {
    const tbodyContent = tbodyMatch[1];
    console.log('📄 DOWNLOAD DEBUG: tbodyContent:', tbodyContent);
    // Use a more flexible regex pattern that can handle whitespace and newlines
    const rowMatches = tbodyContent.match(/<tr[\s\S]*?>([\s\S]*?)<\/tr>/gi);
    console.log('📄 DOWNLOAD DEBUG: rowMatches:', rowMatches);

    if (rowMatches) {
  for (let i = 0; i < rowMatches.length; i++) {
    const row = rowMatches[i];
    console.log('📄 DOWNLOAD DEBUG: Processing row:', row);
    // Use a more flexible regex pattern for cells that can handle whitespace and newlines
    const cells = row.match(/<td[\s\S]*?>([\s\S]*?)<\/td>/gi);
    console.log('📄 DOWNLOAD DEBUG: cells:', cells);

        if (cells && cells.length >= 6) {
          // Extract text content from cells, handling the new regex pattern
          const date = cells[0].replace(/<[^>]*>/g, '').trim();
          const type = cells[1].replace(/<[^>]*>/g, '').trim();
          const description = cells[2].replace(/<[^>]*>/g, '').trim();
          const paymentMethod = cells[3].replace(/<[^>]*>/g, '').trim();
          const amount = cells[4].replace(/<[^>]*>/g, '').trim();
          const notes = cells[5].replace(/<[^>]*>/g, '').trim();

          console.log('📄 DOWNLOAD DEBUG: Parsed transaction:', { date, type, description, paymentMethod, amount, notes });

          // Determine colors based on transaction type
          let typeColor = '000000';
          let amountColor = '000000';

          if (type.toLowerCase().includes('quote')) {
            typeColor = 'D2691E'; // Orange
            amountColor = 'D2691E';
          } else if (type.toLowerCase().includes('payment')) {
            typeColor = '228B22'; // Green
            amountColor = '228B22';
          } else if (type.toLowerCase().includes('adjustment')) {
            typeColor = '4B0082'; // Purple
            amountColor = '4B0082';
          }

          transactions.push({
            date,
            type,
            description,
            paymentMethod,
            amount,
            notes,
            typeColor,
            amountColor,
          });
        }
      }
    }
  }

  console.log('📄 DOWNLOAD DEBUG: Extracted transactions:', transactions.length);
  console.log('📄 DOWNLOAD DEBUG: Transaction details:', transactions);

  // Log if we should include transaction history
  console.log('📄 DOWNLOAD DEBUG: Should include transaction history:', transactions.length > 0);

  return {
    clientName,
    clientId,
    totalQuoted,
    totalPaid,
    currentBalance,
    balanceColor,
    transactions,
  };
}