export type CommunicationType =
  | 'phone_call'
  | 'email'
  | 'meeting'
  | 'sms'
  | 'letter'
  | 'court_hearing'
  | 'other';

export interface CommunicationRecordInput {
  clientId: string;
  clientName: string;
  communicationDate: string;
  communicationType: CommunicationType;
  notes: string;
  subject?: string | null;
  relatedCaseNumber?: string | null;
  courtDate?: string | null;
  source: string;
  openPhoneCallId?: string | null;
  openPhoneConversationId?: string | null;
  openPhoneEventTimestamp?: string | null;
}

export interface CommunicationUpsertResult {
  action: 'created' | 'updated';
  record: any;
}

export class CommunicationDatabaseService {
  private supabase: any;
  private serviceClient: any;

  constructor() {
    this.supabase = null;
    this.serviceClient = null;
  }

  initialize(supabase: any, serviceSupabase?: any): void {
    this.supabase = supabase;
    this.serviceClient = serviceSupabase || supabase;
  }

  private getClient(): any {
    const client = this.serviceClient || this.supabase;
    if (!client) {
      throw new Error('Communication database client not initialized');
    }
    return client;
  }

  async upsertCommunication(record: CommunicationRecordInput): Promise<CommunicationUpsertResult> {
    const client = this.getClient();

    const payload = {
      client_id: record.clientId,
      client_name: record.clientName,
      communication_date: record.communicationDate,
      communication_type: record.communicationType,
      subject: record.subject ?? null,
      notes: record.notes,
      related_case_number: record.relatedCaseNumber ?? null,
      court_date: record.courtDate ?? null,
      source: record.source,
      openphone_call_id: record.openPhoneCallId ?? null,
      openphone_conversation_id: record.openPhoneConversationId ?? null,
      openphone_event_timestamp: record.openPhoneEventTimestamp ?? null,
    };

    const existing = await this.findExistingCommunication(
      record.openPhoneCallId,
      record.openPhoneConversationId
    );

    if (existing) {
      const { data, error } = await client
        .from('communications')
        .update(payload)
        .eq('id', existing.id)
        .select('*')
        .single();

      if (error) {
        throw new Error(`Failed to update communication: ${error.message}`);
      }

      return { action: 'updated', record: data };
    }

    const { data, error } = await client
      .from('communications')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to insert communication: ${error.message}`);
    }

    return { action: 'created', record: data };
  }

  private async findExistingCommunication(
    callId?: string | null,
    conversationId?: string | null
  ): Promise<any | null> {
    if (!callId && !conversationId) {
      return null;
    }

    const client = this.getClient();
    const filters: string[] = [];
    if (callId) {
      filters.push(`openphone_call_id.eq.${callId}`);
    }
    if (conversationId) {
      filters.push(`openphone_conversation_id.eq.${conversationId}`);
    }

    const { data, error } = await client
      .from('communications')
      .select('*')
      .or(filters.join(','))
      .limit(1);

    if (error) {
      console.error('Failed to find existing communication:', error);
      return null;
    }

    return data && data[0] ? data[0] : null;
  }
}

let communicationDbService: CommunicationDatabaseService | null = null;

export function getCommunicationDatabaseService(): CommunicationDatabaseService {
  if (!communicationDbService) {
    communicationDbService = new CommunicationDatabaseService();
  }
  return communicationDbService;
}
