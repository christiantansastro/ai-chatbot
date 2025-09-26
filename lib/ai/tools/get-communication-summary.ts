import { tool } from "ai";
import { z } from "zod";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

interface CommunicationSummary {
  total_communications: number;
  by_type: Record<string, number>;
  by_direction: Record<string, number>;
  by_priority: Record<string, number>;
  follow_ups_pending: number;
  recent_communications: Array<{
    id: string;
    client_name: string;
    communication_date: string;
    communication_type: string;
    priority: string;
    subject?: string;
    follow_up_required: boolean;
  }>;
  upcoming_follow_ups: Array<{
    id: string;
    client_name: string;
    follow_up_date: string;
    priority: string;
    subject?: string;
    days_until: number;
  }>;
}

export const getCommunicationSummary = tool({
  description: "Get comprehensive communication summary including statistics, recent activity, and pending follow-ups. Provides overview of all communication patterns and upcoming tasks.",
  inputSchema: z.object({
    clientName: z.string().optional().describe("Filter summary for a specific client (optional)"),
    daysBack: z.number().optional().default(30).describe("Number of days to look back for recent communications"),
    includeFollowUps: z.boolean().optional().default(true).describe("Include pending follow-ups in the summary"),
    followUpDaysAhead: z.number().optional().default(7).describe("How many days ahead to look for upcoming follow-ups"),
  }),
  execute: async ({
    clientName,
    daysBack = 30,
    includeFollowUps = true,
    followUpDaysAhead = 7
  }): Promise<{
    success: boolean;
    message: string;
    summary: CommunicationSummary | null;
  }> => {
    try {
      console.log('📊 COMMUNICATION SUMMARY TOOL: Getting summary:', { clientName, daysBack, includeFollowUps, followUpDaysAhead });

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
      const byDirection: Record<string, number> = {};
      const byPriority: Record<string, number> = {};
      let followUpsPending = 0;

      communications.forEach((comm: any) => {
        // Count by type
        const type = comm.communication_type;
        byType[type] = (byType[type] || 0) + 1;

        // Count by direction
        const direction = comm.direction;
        byDirection[direction] = (byDirection[direction] || 0) + 1;

        // Count by priority
        const priority = comm.priority;
        byPriority[priority] = (byPriority[priority] || 0) + 1;

        // Count follow-ups
        if (comm.follow_up_required) {
          followUpsPending++;
        }
      });

      // Get recent communications (last 10)
      const recentCommunications = communications.slice(0, 10).map((comm: any) => ({
        id: comm.id,
        client_name: comm.clients?.client_name || comm.client_name || 'Unknown Client',
        communication_date: comm.communication_date,
        communication_type: comm.communication_type,
        priority: comm.priority,
        subject: comm.subject || undefined,
        follow_up_required: comm.follow_up_required,
      }));

      // Get upcoming follow-ups if requested
      let upcomingFollowUps: Array<{
        id: string;
        client_name: string;
        follow_up_date: string;
        priority: string;
        subject?: string;
        days_until: number;
      }> = [];
      if (includeFollowUps) {
        try {
          let followUpQuery = supabase
            .from('communications')
            .select(`
              *,
              clients!inner(client_name)
            `)
            .eq('follow_up_required', true)
            .gte('follow_up_date', new Date().toISOString().split('T')[0])
            .lte('follow_up_date', (() => {
              const futureDate = new Date();
              futureDate.setDate(futureDate.getDate() + followUpDaysAhead);
              return futureDate.toISOString().split('T')[0];
            })())
            .order('follow_up_date', { ascending: true })
            .limit(10);

          let { data: followUps, error: followUpError } = await followUpQuery;

          // Fallback if foreign key fails
          if (followUpError && (followUpError.message?.includes('foreign key') || followUpError.message?.includes('relation'))) {
            let fallbackFollowUpQuery = supabase
              .from('communications')
              .select('*')
              .eq('follow_up_required', true)
              .gte('follow_up_date', new Date().toISOString().split('T')[0])
              .lte('follow_up_date', (() => {
                const futureDate = new Date();
                futureDate.setDate(futureDate.getDate() + followUpDaysAhead);
                return futureDate.toISOString().split('T')[0];
              })())
              .order('follow_up_date', { ascending: true })
              .limit(10);

            const { data: fallbackFollowUps, error: fallbackFollowUpError } = await fallbackFollowUpQuery;

            if (!fallbackFollowUpError && fallbackFollowUps) {
              followUps = fallbackFollowUps.map(record => ({
                ...record,
                clients: { client_name: record.client_name || 'Unknown Client' }
              }));
            }
          }

          if (followUps && followUps.length > 0) {
            upcomingFollowUps = followUps.map((followUp: any) => {
              const followUpDate = new Date(followUp.follow_up_date);
              const today = new Date();
              const daysUntil = Math.ceil((followUpDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

              return {
                id: followUp.id,
                client_name: followUp.clients?.client_name || followUp.client_name || 'Unknown Client',
                follow_up_date: followUp.follow_up_date,
                priority: followUp.priority,
                subject: followUp.subject || undefined,
                days_until: daysUntil
              };
            });
          }
        } catch (followUpErr) {
          console.warn('⚠️ COMMUNICATION SUMMARY TOOL: Could not get follow-ups:', followUpErr);
        }
      }

      // Format summary
      const summary: CommunicationSummary = {
        total_communications: totalCommunications,
        by_type: byType,
        by_direction: byDirection,
        by_priority: byPriority,
        follow_ups_pending: followUpsPending,
        recent_communications: recentCommunications,
        upcoming_follow_ups: upcomingFollowUps
      };

      // Format response message
      let message = `Communication summary for the last ${daysBack} days: ${totalCommunications} total communication${totalCommunications === 1 ? '' : 's'}`;

      if (clientName) {
        message += ` for "${clientName}"`;
      }

      message += '.';

      if (followUpsPending > 0) {
        message += ` ${followUpsPending} follow-up${followUpsPending === 1 ? '' : 's'} pending.`;
      }

      if (upcomingFollowUps.length > 0) {
        message += ` ${upcomingFollowUps.length} follow-up${upcomingFollowUps.length === 1 ? '' : 's'} due in the next ${followUpDaysAhead} days.`;
      }

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