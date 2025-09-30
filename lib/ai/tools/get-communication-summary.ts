import { tool } from "ai";
import { z } from "zod";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

interface CommunicationSummary {
  total_communications: number;
  by_type: Record<string, number>;
  recent_communications: Array<{
    id: string;
    client_name: string;
    communication_date: string;
    communication_type: string;
    subject?: string;
  }>;
}

export const getCommunicationSummary = tool({
  description: "Get comprehensive communication summary including statistics, recent activity, and pending follow-ups. Provides overview of all communication patterns and upcoming tasks.",
  inputSchema: z.object({
    clientName: z.string().optional().describe("Filter summary for a specific client (optional)"),
    daysBack: z.number().optional().default(30).describe("Number of days to look back for recent communications"),
  }),
  execute: async ({
    clientName,
    daysBack = 30
  }): Promise<{
    success: boolean;
    message: string;
    summary: CommunicationSummary | null;
  }> => {
    try {
      console.log('📊 COMMUNICATION SUMMARY TOOL: Getting summary:', { clientName, daysBack });

      // Validate environment variables
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.error('❌ COMMUNICATION SUMMARY TOOL: Missing Supabase environment variables');
        return {
          success: false,
          message: 'Database configuration error: Missing Supabase credentials',
          summary: null
        };
      }

      console.log('📊 COMMUNICATION SUMMARY TOOL: Environment variables validated');

      // Create Supabase client
      const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      console.log('📊 COMMUNICATION SUMMARY TOOL: Date range:', startDate.toISOString().split('T')[0], 'to', endDate.toISOString().split('T')[0]);

      // Build base query
      let query = supabase
        .from('communications')
        .select(`
          *,
          clients!inner(client_name)
        `)
        .gte('communication_date', startDate.toISOString().split('T')[0])
        .order('communication_date', { ascending: false })
        .order('created_at', { ascending: false });

      // Apply client filter if specified
      if (clientName) {
        query = query.ilike('clients.client_name', `%${clientName}%`);
      }

      // Execute main query
      let { data: communications, error: queryError } = await query;

      // Fallback if foreign key fails
      if (queryError && (queryError.message?.includes('foreign key') || queryError.message?.includes('relation'))) {
        console.log('📊 COMMUNICATION SUMMARY TOOL: Trying fallback query without joins...');

        let fallbackQuery = supabase
          .from('communications')
          .select('*')
          .gte('communication_date', startDate.toISOString().split('T')[0])
          .order('communication_date', { ascending: false })
          .order('created_at', { ascending: false });

        if (clientName) {
          fallbackQuery = fallbackQuery.ilike('client_name', `%${clientName}%`);
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
          message: `Failed to get communication summary: ${queryError?.message || 'No data returned'}`,
          summary: null
        };
      }

      console.log(`✅ COMMUNICATION SUMMARY TOOL: Found ${communications.length} communications in the last ${daysBack} days`);

      // Calculate statistics
      const totalCommunications = communications.length;
      const byType: Record<string, number> = {};

      communications.forEach((comm: any) => {
        // Count by type
        const type = comm.communication_type;
        byType[type] = (byType[type] || 0) + 1;
      });

      // Get recent communications (last 10)
      const recentCommunications = communications.slice(0, 10).map((comm: any) => ({
        id: comm.id,
        client_name: comm.clients?.client_name || comm.client_name || 'Unknown Client',
        communication_date: comm.communication_date,
        communication_type: comm.communication_type,
        subject: comm.subject || undefined,
      }));

      // Note: Follow-up functionality removed since follow_up_date column was removed

      // Format summary
      const summary: CommunicationSummary = {
        total_communications: totalCommunications,
        by_type: byType,
        recent_communications: recentCommunications
      };

      // Format response message
      let message = `Communication summary for the last ${daysBack} days: ${totalCommunications} total communication${totalCommunications === 1 ? '' : 's'}`;

      if (clientName) {
        message += ` for "${clientName}"`;
      }

      message += '.';

      // Note: Follow-up and priority information no longer available since those columns were removed

      // Add breakdown by type if significant
      const topTypes = Object.entries(byType)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3);

      if (topTypes.length > 0) {
        message += ' Most common types:';
        topTypes.forEach(([type, count]) => {
          message += ` ${type.replace('_', ' ')} (${count})`;
        });
        message += '.';
      }

      return {
        success: true,
        message,
        summary
      };

    } catch (error) {
      console.error('❌ COMMUNICATION SUMMARY TOOL: Error getting communication summary:', error);
      return {
        success: false,
        message: `Error getting communication summary: ${error instanceof Error ? error.message : 'Unknown error'}`,
        summary: null
      };
    }
  },
});