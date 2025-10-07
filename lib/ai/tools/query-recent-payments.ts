import { tool } from "ai";
import { z } from "zod";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Get current date in GMT-4 timezone (UTC-4)
 * This ensures consistent timezone handling across all date calculations
 */
function getGMT4Date(): Date {
  const now = new Date();
  // Get the current time in milliseconds since epoch
  const currentTime = now.getTime();
  // GMT-4 is UTC-4, so subtract 4 hours (4 * 60 * 60 * 1000 milliseconds)
  const gmt4Time = currentTime - (4 * 60 * 60 * 1000);
  return new Date(gmt4Time);
}

interface PaymentRecord {
  client_id?: string;
  client_name: string;
  total_paid: number;
  payment_count: number;
  latest_payment_date: string;
  payment_methods: string[];
  case_numbers: string[];
  total_amount_this_period: number;
}

interface ClientPayment {
  client_id?: string;
  client_name: string;
  total_paid: number;
  payment_count: number;
  latest_payment_date: string;
  payment_methods: string[];
  case_numbers: string[];
  transactions: Array<{
    id: string;
    amount: number;
    payment_method: string;
    transaction_date: string;
    case_number: string;
    service_description?: string;
    notes?: string;
  }>;
}

export const queryRecentPayments = tool({
  description: "Query for clients who have made payments within a specified time period (this week, last week, this month, etc.) using GMT-4 timezone. Returns a list of clients with their payment details and amounts.",
  inputSchema: z.object({
    timePeriod: z.enum(['this_week', 'last_week', 'this_month', 'last_month', 'last_7_days', 'last_30_days', 'custom_range']).describe("Time period to query payments for"),
    startDate: z.string().optional().describe("Custom start date (YYYY-MM-DD) when timePeriod is 'custom_range'"),
    endDate: z.string().optional().describe("Custom end date (YYYY-MM-DD) when timePeriod is 'custom_range'"),
    includeTransactionDetails: z.boolean().optional().default(false).describe("Whether to include detailed transaction information for each payment"),
    minAmount: z.number().optional().describe("Minimum payment amount to include in results"),
    maxResults: z.number().optional().default(50).describe("Maximum number of clients to return"),
  }),
  execute: async ({ timePeriod, startDate, endDate, includeTransactionDetails = false, minAmount, maxResults = 50 }): Promise<{
    success: boolean;
    message: string;
    clients: ClientPayment[];
    summary: {
      total_clients: number;
      total_payments: number;
      total_amount: number;
      time_period: string;
    };
  }> => {
    try {
      console.log('💳 RECENT PAYMENTS TOOL: Querying payments for period:', timePeriod);

      // Validate environment variables
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.error('❌ RECENT PAYMENTS TOOL: Missing Supabase environment variables');
        return {
          success: false,
          message: 'Database configuration error: Missing Supabase credentials',
          clients: [],
          summary: { total_clients: 0, total_payments: 0, total_amount: 0, time_period: timePeriod }
        };
      }

      console.log('💳 RECENT PAYMENTS TOOL: Environment variables validated');

      // Create Supabase client
      const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

      // Calculate date range based on timePeriod (using GMT-4 timezone)
      const now = getGMT4Date();
      let startDateTime: Date;
      let endDateTime: Date = new Date(now);

      switch (timePeriod) {
        case 'this_week':
          // Start of current week (Sunday)
          startDateTime = new Date(now);
          startDateTime.setDate(now.getDate() - now.getDay());
          startDateTime.setHours(0, 0, 0, 0);
          endDateTime = new Date(startDateTime);
          endDateTime.setDate(startDateTime.getDate() + 6);
          endDateTime.setHours(23, 59, 59, 999);
          break;

        case 'last_week':
          // Start of last week (Sunday to Saturday)
          startDateTime = new Date(now);
          startDateTime.setDate(now.getDate() - now.getDay() - 7);
          startDateTime.setHours(0, 0, 0, 0);
          endDateTime = new Date(startDateTime);
          endDateTime.setDate(startDateTime.getDate() + 6);
          endDateTime.setHours(23, 59, 59, 999);
          break;

        case 'this_month':
          // Start of current month
          startDateTime = new Date(now.getFullYear(), now.getMonth(), 1);
          endDateTime = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
          break;

        case 'last_month':
          // Start of last month
          startDateTime = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          endDateTime = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
          break;

        case 'last_7_days':
          // Last 7 days from today
          startDateTime = new Date(now);
          startDateTime.setDate(now.getDate() - 7);
          startDateTime.setHours(0, 0, 0, 0);
          endDateTime.setHours(23, 59, 59, 999);
          break;

        case 'last_30_days':
          // Last 30 days from today
          startDateTime = new Date(now);
          startDateTime.setDate(now.getDate() - 30);
          startDateTime.setHours(0, 0, 0, 0);
          endDateTime.setHours(23, 59, 59, 999);
          break;

        case 'custom_range':
          if (!startDate || !endDate) {
            return {
              success: false,
              message: 'Custom range requires both startDate and endDate parameters',
              clients: [],
              summary: { total_clients: 0, total_payments: 0, total_amount: 0, time_period: timePeriod }
            };
          }
          // Parse custom dates in GMT-4 timezone for consistency
          startDateTime = new Date(startDate + 'T00:00:00.000-04:00');
          endDateTime = new Date(endDate + 'T23:59:59.999-04:00');
          break;

        default:
          return {
            success: false,
            message: 'Invalid time period specified',
            clients: [],
            summary: { total_clients: 0, total_payments: 0, total_amount: 0, time_period: timePeriod }
          };
      }

      console.log('💳 RECENT PAYMENTS TOOL: Date range calculated:', {
        start: startDateTime.toISOString(),
        end: endDateTime.toISOString()
      });

      // Build the query for payments within the date range
      let query = supabase
        .from('financials')
        .select(`
          id,
          client_id,
          client_name,
          amount,
          payment_method,
          transaction_date,
          case_number,
          service_description,
          notes
        `)
        .eq('transaction_type', 'payment')
        .gte('transaction_date', startDateTime.toISOString().split('T')[0])
        .lte('transaction_date', endDateTime.toISOString().split('T')[0])
        .order('transaction_date', { ascending: false });

      // Apply minimum amount filter if specified
      if (minAmount !== undefined) {
        query = query.gte('amount', minAmount);
      }

      console.log('💳 RECENT PAYMENTS TOOL: Executing payments query...');
      const { data: payments, error: paymentsError } = await query;

      if (paymentsError) {
        console.error('❌ RECENT PAYMENTS TOOL: Database query failed:', paymentsError);
        return {
          success: false,
          message: `Failed to query payment data: ${paymentsError.message}`,
          clients: [],
          summary: { total_clients: 0, total_payments: 0, total_amount: 0, time_period: timePeriod }
        };
      }

      if (!payments || payments.length === 0) {
        console.log('💳 RECENT PAYMENTS TOOL: No payments found for the specified period');
        return {
          success: true,
          message: `No payments found for ${timePeriod.replace('_', ' ')}.`,
          clients: [],
          summary: { total_clients: 0, total_payments: 0, total_amount: 0, time_period: timePeriod }
        };
      }

      console.log(`💳 RECENT PAYMENTS TOOL: Found ${payments.length} payment transactions`);

      // Group payments by client
      const clientMap = new Map<string, ClientPayment>();

      for (const payment of payments) {
        const clientName = payment.client_name;
        const clientId = payment.client_id;

        if (!clientMap.has(clientName)) {
          clientMap.set(clientName, {
            client_id: clientId,
            client_name: clientName,
            total_paid: 0,
            payment_count: 0,
            latest_payment_date: payment.transaction_date,
            payment_methods: [],
            case_numbers: [],
            transactions: []
          });
        }

        const clientData = clientMap.get(clientName)!;
        clientData.total_paid += Number(payment.amount);
        clientData.payment_count += 1;

        // Update latest payment date if this is more recent
        if (payment.transaction_date > clientData.latest_payment_date) {
          clientData.latest_payment_date = payment.transaction_date;
        }

        // Track unique payment methods
        if (payment.payment_method && !clientData.payment_methods.includes(payment.payment_method)) {
          clientData.payment_methods.push(payment.payment_method);
        }

        // Track unique case numbers
        if (payment.case_number && !clientData.case_numbers.includes(payment.case_number)) {
          clientData.case_numbers.push(payment.case_number);
        }

        // Add transaction details if requested
        if (includeTransactionDetails) {
          clientData.transactions.push({
            id: payment.id,
            amount: Number(payment.amount),
            payment_method: payment.payment_method || 'Not specified',
            transaction_date: payment.transaction_date,
            case_number: payment.case_number || 'Not specified',
            service_description: payment.service_description || undefined,
            notes: payment.notes || undefined
          });
        }
      }

      // Convert map to array and limit results
      const clients = Array.from(clientMap.values())
        .sort((a, b) => new Date(b.latest_payment_date).getTime() - new Date(a.latest_payment_date).getTime())
        .slice(0, maxResults);

      // Calculate summary statistics
      const totalAmount = clients.reduce((sum, client) => sum + client.total_paid, 0);
      const totalPayments = clients.reduce((sum, client) => sum + client.payment_count, 0);

      // Format time period for display
      const timePeriodDisplay = timePeriod.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());

      let message = `Found ${clients.length} client${clients.length === 1 ? '' : 's'} who made payments during ${timePeriodDisplay}, with a total of ${totalPayments} payment${totalPayments === 1 ? '' : 's'} amounting to $${totalAmount.toFixed(2)}.`;

      if (minAmount) {
        message += ` (Filtered for payments ≥ $${minAmount})`;
      }

      return {
        success: true,
        message,
        clients,
        summary: {
          total_clients: clients.length,
          total_payments: totalPayments,
          total_amount: totalAmount,
          time_period: timePeriod
        }
      };

    } catch (error) {
      console.error('❌ RECENT PAYMENTS TOOL: Error querying recent payments:', error);
      return {
        success: false,
        message: `Error querying recent payments: ${error instanceof Error ? error.message : 'Unknown error'}`,
        clients: [],
        summary: { total_clients: 0, total_payments: 0, total_amount: 0, time_period: timePeriod }
      };
    }
  },
});