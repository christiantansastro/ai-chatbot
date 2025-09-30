import { tool } from "ai";
import { z } from "zod";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

interface CommunicationRecord {
  id: string;
  client_id: string;
  client_name: string;
  communication_date: string;
  communication_type: string;
  subject?: string;
  notes: string;
}

export const queryCommunications = tool({
  description: "Query communication records for clients with advanced filtering options. Can search by client name, communication type, date range, priority, and follow-up status.",
  inputSchema: z.object({
    clientName: z.string().optional().describe("Name of the client to get communications for (optional - if not provided, returns all)"),
    communicationType: z.enum(['all', 'phone_call', 'email', 'meeting', 'sms', 'letter', 'court_hearing', 'other']).optional().default('all').describe("Filter by communication type"),
    dateFrom: z.string().optional().describe("Start date for communication records (YYYY-MM-DD format)"),
    dateTo: z.string().optional().describe("End date for communication records (YYYY-MM-DD format)"),
    limit: z.number().optional().default(20).describe("Maximum number of records to return"),
  }),
  execute: async ({
    clientName,
    communicationType = 'all',
    dateFrom,
    dateTo,
    limit = 20
  }): Promise<{
    success: boolean;
    message: string;
    communications: CommunicationRecord[];
    summary: {
      total_found: number;
      follow_ups_pending: number;
      high_priority_count: number;
      by_type: Record<string, number>;
    };
  }> => {
    try {
      console.log('📞 COMMUNICATIONS QUERY TOOL: Searching communications:', {
        clientName, communicationType, dateFrom, dateTo, limit
      });

      // Validate environment variables
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.error('❌ COMMUNICATIONS QUERY TOOL: Missing Supabase environment variables');
        return {
          success: false,
          message: 'Database configuration error: Missing Supabase credentials',
          communications: [],
          summary: { total_found: 0, follow_ups_pending: 0, high_priority_count: 0, by_type: {} }
        };
      }

      console.log('📞 COMMUNICATIONS QUERY TOOL: Environment variables validated');

      // Create Supabase client
      const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

      // Build query
      let query = supabase
        .from('communications')
        .select(`
          *,
          clients!inner(client_name)
        `)
        .order('communication_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);

      // Apply filters
      if (clientName) {
        query = query.ilike('clients.client_name', `%${clientName}%`);
      }

      if (communicationType !== 'all') {
        query = query.eq('communication_type', communicationType);
      }

      // No additional filters needed for removed fields

      if (dateFrom) {
        query = query.gte('communication_date', dateFrom);
      }

      if (dateTo) {
        query = query.lte('communication_date', dateTo);
      }

      console.log('📞 COMMUNICATIONS QUERY TOOL: Executing query...');
      let { data: communications, error: queryError } = await query;

      // If query fails due to foreign key issues, try fallback
      if (queryError && (queryError.message?.includes('foreign key') || queryError.message?.includes('relation'))) {
        console.log('📞 COMMUNICATIONS QUERY TOOL: Trying fallback query without joins...');

        let fallbackQuery = supabase
          .from('communications')
          .select('*')
          .order('communication_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(limit);

        if (clientName) {
          fallbackQuery = fallbackQuery.ilike('client_name', `%${clientName}%`);
        }

        if (communicationType !== 'all') {
          fallbackQuery = fallbackQuery.eq('communication_type', communicationType);
        }

        // No additional filters needed for removed fields

        if (dateFrom) {
          fallbackQuery = fallbackQuery.gte('communication_date', dateFrom);
        }

        if (dateTo) {
          fallbackQuery = fallbackQuery.lte('communication_date', dateTo);
        }

        const { data: fallbackData, error: fallbackError } = await fallbackQuery;

        if (!fallbackError && fallbackData) {
          communications = fallbackData.map(record => ({
            ...record,
            clients: { client_name: record.client_name || 'Unknown Client' }
          }));
          queryError = null;
        }
      }

      if (queryError || !communications) {
        return {
          success: false,
          message: `Failed to query communications: ${queryError?.message || 'No data returned'}`,
          communications: [],
          summary: { total_found: 0, follow_ups_pending: 0, high_priority_count: 0, by_type: {} }
        };
      }

      console.log(`✅ COMMUNICATIONS QUERY TOOL: Found ${communications?.length || 0} communications`);

      // Process and format results
      const formattedCommunications: CommunicationRecord[] = (communications || []).map((record: any) => ({
        id: record.id,
        client_id: record.client_id,
        client_name: record.clients?.client_name || record.client_name || 'Unknown Client',
        communication_date: record.communication_date,
        communication_type: record.communication_type,
        subject: record.subject || undefined,
        notes: record.notes,
      }));

      // Calculate summary statistics
      const summary = {
        total_found: formattedCommunications.length,
        follow_ups_pending: 0, // No longer available since follow_up_required column was removed
        high_priority_count: 0, // No longer available since priority column was removed
        by_type: formattedCommunications.reduce((acc, comm) => {
          acc[comm.communication_type] = (acc[comm.communication_type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      };

      // Format response message
      let message = `Found ${summary.total_found} communication${summary.total_found === 1 ? '' : 's'}`;

      if (clientName) {
        message += ` for "${clientName}"`;
      }

      if (communicationType !== 'all') {
        message += ` of type "${communicationType}"`;
      }

      message += '.';

      // Note: Follow-up and priority information no longer available since those columns were removed

      return {
        success: true,
        message,
        communications: formattedCommunications,
        summary
      };

    } catch (error) {
      console.error('❌ COMMUNICATIONS QUERY TOOL: Error querying communications:', error);
      return {
        success: false,
        message: `Error querying communications: ${error instanceof Error ? error.message : 'Unknown error'}`,
        communications: [],
        summary: { total_found: 0, follow_ups_pending: 0, high_priority_count: 0, by_type: {} }
      };
    }
  },
});