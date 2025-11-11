import { getOpenPhoneClient } from './openphone-client';
import { getClientDatabaseService } from './client-database-service';
import {
  CommunicationType,
  getCommunicationDatabaseService,
  type CommunicationRecordInput,
} from './communication-database-service';
import { databaseFactory, databaseService } from './db/database-factory';
import type { Client } from './db/schema';

interface CallParticipant {
  contactId?: string;
  displayName?: string;
  phoneNumber?: string;
  type?: string;
}

interface OpenPhoneCall {
  id: string;
  startedAt?: string;
  endedAt?: string;
  summary?: string;
  direction?: 'inbound' | 'outbound';
  participants?: CallParticipant[];
  contact?: {
    id?: string;
    displayName?: string;
    phoneNumber?: string;
    email?: string;
  };
  metadata?: Record<string, any>;
}

interface OpenPhoneConversation {
  id: string;
  type?: string;
  title?: string;
  updatedAt?: string;
  lastMessage?: {
    id: string;
    content?: string;
    createdAt?: string;
    direction?: string;
  };
  participants?: CallParticipant[];
}

export interface CommunicationSyncOptions {
  startDate?: Date;
  endDate?: Date;
  includeCalls?: boolean;
  includeMessages?: boolean;
  pageSize?: number;
}

export interface CommunicationSyncResult {
  callsProcessed: number;
  conversationsProcessed: number;
  communicationsCreated: number;
  communicationsUpdated: number;
  clientsCreated: number;
}

export class OpenPhoneCommunicationsSyncService {
  private openPhoneClient = getOpenPhoneClient();
  private clientDbService = getClientDatabaseService();
  private communicationDbService = getCommunicationDatabaseService();
  private initialized = false;

  private async ensureDatabaseReady(): Promise<void> {
    if (this.initialized) return;

    await databaseService.healthCheck();
    const adapter = databaseFactory.getAdapter();
    if (adapter && (adapter.supabase || adapter.serviceSupabase)) {
      this.clientDbService.initialize(adapter.supabase, adapter.serviceSupabase || adapter.supabase);
      this.communicationDbService.initialize(adapter.supabase, adapter.serviceSupabase || adapter.supabase);
      this.initialized = true;
    } else {
      throw new Error('Failed to initialize database adapter for communication sync');
    }
  }

  async syncCommunications(options: CommunicationSyncOptions = {}): Promise<CommunicationSyncResult> {
    await this.ensureDatabaseReady();

    const now = new Date();
    const start = options.startDate || new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const end = options.endDate || now;
    const includeCalls = options.includeCalls !== false;
    const includeMessages = options.includeMessages !== false;
    const pageSize = options.pageSize || 100;

    let callsProcessed = 0;
    let conversationsProcessed = 0;
    let communicationsCreated = 0;
    let communicationsUpdated = 0;
    let clientsCreated = 0;

    if (includeCalls) {
      const callStats = await this.importCalls(start, end, pageSize);
      callsProcessed += callStats.recordsProcessed;
      communicationsCreated += callStats.creations;
      communicationsUpdated += callStats.updates;
      clientsCreated += callStats.clientsCreated;
    }

    if (includeMessages) {
      const convoStats = await this.importConversations(start, end, pageSize);
      conversationsProcessed += convoStats.recordsProcessed;
      communicationsCreated += convoStats.creations;
      communicationsUpdated += convoStats.updates;
      clientsCreated += convoStats.clientsCreated;
    }

    return {
      callsProcessed,
      conversationsProcessed,
      communicationsCreated,
      communicationsUpdated,
      clientsCreated,
    };
  }

  async handleWebhookEvent(event: any): Promise<void> {
    await this.ensureDatabaseReady();

    const eventType: string | undefined = event?.type || event?.event;
    const payload = event?.data || event;

    if (!eventType) {
      console.warn('OpenPhone webhook missing event type');
      return;
    }

    if (eventType.includes('call')) {
      await this.processCallRecord(payload as OpenPhoneCall);
    } else if (eventType.includes('message') || eventType.includes('conversation')) {
      await this.processConversationRecord(payload as OpenPhoneConversation);
    } else {
      console.log('Unhandled OpenPhone webhook event:', eventType);
    }
  }

  private async importCalls(start: Date, end: Date, pageSize: number) {
    let cursor: string | null = null;
    let hasMore = true;
    let recordsProcessed = 0;
    let creations = 0;
    let updates = 0;
    let clientsCreated = 0;

    while (hasMore) {
      const response = await this.openPhoneClient.listCalls({
        limit: pageSize,
        cursor,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

      recordsProcessed += response.data.length;

      for (const call of response.data) {
        const result = await this.processCallRecord(call);
        if (result?.action === 'created') {
          creations++;
        } else if (result?.action === 'updated') {
          updates++;
        }
        if (result?.clientCreated) {
          clientsCreated++;
        }
      }

      cursor = response.nextCursor || null;
      hasMore = Boolean(cursor);
    }

    return { recordsProcessed, creations, updates, clientsCreated };
  }

  private async importConversations(start: Date, end: Date, pageSize: number) {
    let cursor: string | null = null;
    let hasMore = true;
    let recordsProcessed = 0;
    let creations = 0;
    let updates = 0;
    let clientsCreated = 0;

    while (hasMore) {
      const response = await this.openPhoneClient.listConversations({
        limit: pageSize,
        cursor,
        updatedAfter: start.toISOString(),
        updatedBefore: end.toISOString(),
      });

      recordsProcessed += response.data.length;

      for (const conversation of response.data) {
        const result = await this.processConversationRecord(conversation);
        if (result?.action === 'created') {
          creations++;
        } else if (result?.action === 'updated') {
          updates++;
        }
        if (result?.clientCreated) {
          clientsCreated++;
        }
      }

      cursor = response.nextCursor || null;
      hasMore = Boolean(cursor);
    }

    return { recordsProcessed, creations, updates, clientsCreated };
  }

  private async processCallRecord(call: OpenPhoneCall) {
    if (!call?.id) return null;
    const contact = this.extractContact(call);
    const clientResult = await this.resolveClient(contact);
    const communicationDate = this.toDateOnly(call.startedAt || call.endedAt || new Date().toISOString());
    const summary =
      call.summary ||
      call.metadata?.summary ||
      `Phone call ${call.direction === 'outbound' ? 'to' : 'from'} ${contact.name || 'contact'}`;

    const payload: CommunicationRecordInput = {
      clientId: clientResult.client.id,
      clientName: clientResult.client.client_name,
      communicationDate,
      communicationType: 'phone_call',
      subject: `Phone call with ${contact.name || contact.phone || 'contact'}`,
      notes: summary,
      source: 'Quo',
      openPhoneCallId: call.id,
      openPhoneEventTimestamp: call.endedAt || call.startedAt || new Date().toISOString(),
    };

    const result = await this.communicationDbService.upsertCommunication(payload);
    return { ...result, clientCreated: clientResult.created };
  }

  private async processConversationRecord(conversation: OpenPhoneConversation) {
    if (!conversation?.id) return null;
    const contact = this.extractContact(conversation);
    const clientResult = await this.resolveClient(contact);
    const communicationType = this.mapConversationType(conversation.type);
    const latestTimestamp =
      conversation.lastMessage?.createdAt || conversation.updatedAt || new Date().toISOString();
    const communicationDate = this.toDateOnly(latestTimestamp);
    const notes =
      conversation.lastMessage?.content ||
      conversation.title ||
      `Conversation update received on ${communicationDate}`;

    const payload: CommunicationRecordInput = {
      clientId: clientResult.client.id,
      clientName: clientResult.client.client_name,
      communicationDate,
      communicationType,
      subject: conversation.title || `${communicationType} conversation`,
      notes,
      source: 'Quo',
      openPhoneConversationId: conversation.id,
      openPhoneEventTimestamp: latestTimestamp,
    };

    const result = await this.communicationDbService.upsertCommunication(payload);
    return { ...result, clientCreated: clientResult.created };
  }

  private extractContact(source: {
    participants?: CallParticipant[];
    contact?: { id?: string; displayName?: string; phoneNumber?: string; email?: string };
  }) {
    const participant = source.participants?.find(p => p.type !== 'user') || source.participants?.[0];
    const contact = source.contact || {};
    const name = contact.displayName || participant?.displayName || null;
    const phone = contact.phoneNumber || participant?.phoneNumber || null;
    const contactId = contact.id || participant?.contactId || null;
    const email = contact.email || null;

    return { name, phone, contactId, email };
  }

  private async resolveClient(contact: {
    name?: string | null;
    phone?: string | null;
    contactId?: string | null;
    email?: string | null;
  }): Promise<{ client: Client; created: boolean }> {
    const normalizedPhone = contact.phone ? this.normalizePhone(contact.phone) : null;
    let client =
      (await this.clientDbService.findClientByOpenPhoneContactId(contact.contactId || undefined)) ||
      (contact.name ? await this.clientDbService.findClientByName(contact.name) : null) ||
      (normalizedPhone ? await this.clientDbService.findClientByPhoneNumbers([normalizedPhone]) : null);

    if (client) {
      if (contact.contactId && !client.openphone_contact_id) {
        await this.clientDbService.attachOpenPhoneContactId(client.id, contact.contactId);
        client.openphone_contact_id = contact.contactId;
      }
      return { client, created: false };
    }

    client = await this.clientDbService.createClientFromOpenPhoneContact({
      name: contact.name || undefined,
      phone: normalizedPhone || contact.phone || undefined,
      email: contact.email || undefined,
      openPhoneContactId: contact.contactId || undefined,
    });

    return { client, created: true };
  }

  private mapConversationType(type?: string | null): CommunicationType {
    if (!type) return 'sms';
    switch (type.toLowerCase()) {
      case 'sms':
      case 'text':
        return 'sms';
      case 'email':
        return 'email';
      case 'phone':
      case 'call':
        return 'phone_call';
      default:
        return 'sms';
    }
  }

  private toDateOnly(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return new Date().toISOString().split('T')[0];
    }
    return date.toISOString().split('T')[0];
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/[^\d+]/g, '');
  }
}

let communicationsSyncService: OpenPhoneCommunicationsSyncService | null = null;

export function getCommunicationsSyncService(): OpenPhoneCommunicationsSyncService {
  if (!communicationsSyncService) {
    communicationsSyncService = new OpenPhoneCommunicationsSyncService();
  }
  return communicationsSyncService;
}
