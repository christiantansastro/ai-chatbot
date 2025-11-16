import { getOpenPhoneClient } from './openphone-client';
import { getClientDatabaseService } from './client-database-service';
import {
  CommunicationType,
  getCommunicationDatabaseService,
  type CommunicationRecordInput,
} from './communication-database-service';
import { databaseFactory, databaseService } from './db/database-factory';
import type { Client } from './db/schema';
import type { OpenPhoneContact } from './openphone-mapping';

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

interface NormalizedOpenPhoneEvent {
  eventType?: string;
  payload?: any;
  data?: any;
  raw: any;
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
  private phoneNumbersCache: Array<{ id: string; number: string }> | null = null;

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

    const needsPhoneNumbers = includeCalls || includeMessages;
    const phoneNumbers = needsPhoneNumbers ? await this.getWorkspacePhoneNumbers() : [];

    if (needsPhoneNumbers && phoneNumbers.length === 0) {
      console.warn('No OpenPhone phone numbers found for synchronization');
      return {
        callsProcessed,
        conversationsProcessed,
        communicationsCreated,
        communicationsUpdated,
        clientsCreated,
      };
    }

    if (includeCalls) {
      const callStats = await this.importCalls(phoneNumbers, start, end, pageSize);
      callsProcessed += callStats.recordsProcessed;
      communicationsCreated += callStats.creations;
      communicationsUpdated += callStats.updates;
      clientsCreated += callStats.clientsCreated;
    }

    if (includeMessages) {
      const convoStats = await this.importConversations(phoneNumbers, start, end, pageSize);
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

    const normalized = this.normalizeWebhookEvent(event);
    const eventType = normalized.eventType;

    if (!eventType) {
      console.warn('OpenPhone webhook missing event type');
      return;
    }

    const normalizedType = eventType.toLowerCase();

    if (normalizedType.startsWith('call.summary')) {
      await this.processCallSummaryEvent(normalized);
      return;
    }

    if (normalizedType.includes('call')) {
      if (!normalized.payload) {
        console.warn('Call event missing payload', event);
        return;
      }
      await this.processCallRecord(normalized.payload as OpenPhoneCall);
    } else if (normalizedType.includes('message') || normalizedType.includes('conversation')) {
      if (!normalized.payload) {
        console.warn('Message event missing payload', event);
        return;
      }
      await this.processConversationRecord(normalized.payload as OpenPhoneConversation);
    } else {
      console.log('Unhandled OpenPhone webhook event:', eventType);
    }
  }

  private normalizeWebhookEvent(event: any): NormalizedOpenPhoneEvent {
    if (!event) {
      return { eventType: undefined, payload: undefined, data: undefined, raw: event };
    }

    const eventContainer =
      event?.object && typeof event.object === 'object' && event.object?.object === 'event'
        ? event.object
        : event;

    const eventType =
      eventContainer?.type ||
      eventContainer?.eventType ||
      eventContainer?.event ||
      event?.type ||
      event?.event ||
      (eventContainer?.object && typeof eventContainer.object === 'object'
        ? (eventContainer.object as any).type
        : undefined);

    const data = eventContainer?.data ?? event?.data ?? eventContainer;
    const payload =
      typeof data === 'object' && data !== null && 'object' in data ? (data as any).object ?? data : data;

    return {
      eventType,
      payload,
      data,
      raw: event,
    };
  }

  private async processCallSummaryEvent(event: NormalizedOpenPhoneEvent): Promise<void> {
    const summaryPayload = event.payload || {};
    const callId: string | undefined = summaryPayload?.callId || summaryPayload?.call?.id;
    if (!callId) {
      console.warn('Call summary event missing callId');
      return;
    }

    try {
      const response = await this.openPhoneClient.getCall(callId);
      const callRecord = (response?.data ?? response) as OpenPhoneCall | undefined;
      if (!callRecord?.id) {
        console.warn('Call summary event could not load call details for callId:', callId);
        return;
      }

      const formattedSummary = this.formatCallSummaryPayload(summaryPayload);
      const metadata: Record<string, any> = { ...(callRecord.metadata || {}) };

      if (formattedSummary) {
        callRecord.summary = formattedSummary;
        metadata.callSummary = formattedSummary;
        metadata.callSummarySections = {
          summary: Array.isArray(summaryPayload?.summary) ? summaryPayload.summary : undefined,
          nextSteps: Array.isArray(summaryPayload?.nextSteps) ? summaryPayload.nextSteps : undefined,
        };
      }

      const deepLink = (event.data as any)?.deepLink;
      if (typeof deepLink === 'string' && deepLink.trim().length > 0) {
        metadata.deepLink = deepLink;
      }

      if (Object.keys(metadata).length > 0) {
        callRecord.metadata = metadata;
      }

      await this.processCallRecord(callRecord);
    } catch (error) {
      console.error('Failed to process call summary event:', error);
    }
  }

  private async importCalls(
    phoneNumbers: Array<{ id: string; number: string }>,
    start: Date,
    end: Date,
    pageSize: number
  ) {
    let recordsProcessed = 0;
    let creations = 0;
    let updates = 0;
    let clientsCreated = 0;

    const startIso = start.toISOString();
    const endIso = end.toISOString();

    await this.clientDbService.batchProcessClients(50, async clients => {
      for (const client of clients) {
        const participant = this.formatParticipantPhone(client.phone);
        if (!participant) {
          continue;
        }
        for (const phoneNumber of phoneNumbers) {
          const counters = await this.fetchCallsForPair(
            phoneNumber.id,
            participant,
            startIso,
            endIso,
            pageSize,
            client
          );
          recordsProcessed += counters.recordsProcessed;
          creations += counters.creations;
          updates += counters.updates;
          clientsCreated += counters.clientsCreated;
        }
      }
    });

    return { recordsProcessed, creations, updates, clientsCreated };
  }

  private async importConversations(
    phoneNumbers: Array<{ id: string; number: string }>,
    start: Date,
    end: Date,
    pageSize: number
  ) {
    let recordsProcessed = 0;
    let creations = 0;
    let updates = 0;
    let clientsCreated = 0;

    const phoneNumberIds = phoneNumbers.map(number => number.id);
    const phoneNumberChunks = this.chunkArray(phoneNumberIds, 50);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    for (const chunk of phoneNumberChunks) {
      let pageToken: string | undefined;
      do {
        let response;
        try {
          const maxResults = Math.min(Math.max(pageSize, 1), 100);
          response = await this.openPhoneClient.listConversations({
            phoneNumbers: chunk,
            updatedAfter: startIso,
            updatedBefore: endIso,
            maxResults,
            pageToken,
            excludeInactive: true,
          });
        } catch (error) {
          console.warn('Failed to list conversations for phone numbers:', chunk, error);
          break;
        }

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

        pageToken = response.nextPageToken || undefined;
      } while (pageToken);
    }

    return { recordsProcessed, creations, updates, clientsCreated };
  }

  private async processCallRecord(call: OpenPhoneCall, matchedClient?: Client, fallbackPhone?: string) {
    if (!call?.id) return null;
    const contact = this.extractContact(call);
    if (!contact.phone && fallbackPhone) {
      contact.phone = fallbackPhone;
    }

    const clientResult = matchedClient
      ? { client: matchedClient, created: false }
      : await this.resolveClient(contact);

    const communicationDate = this.toDateOnly(call.startedAt || call.endedAt || new Date().toISOString());
    const summary =
      this.extractCallSummary(call) ||
      `Phone call ${call.direction === 'outbound' ? 'to' : 'from'} ${clientResult.client.client_name}`;

    const payload: CommunicationRecordInput = {
      clientId: clientResult.client.id,
      clientName: clientResult.client.client_name,
      communicationDate,
      communicationType: 'phone_call',
      subject: `Phone call with ${clientResult.client.client_name}`,
      notes: summary,
      source: 'Quo',
      openPhoneCallId: call.id,
      openPhoneEventTimestamp: call.endedAt || call.startedAt || new Date().toISOString(),
    };

    const result = await this.communicationDbService.upsertCommunication(payload);
    return { ...result, clientCreated: clientResult.created };
  }

  private async processConversationRecord(
    conversation: OpenPhoneConversation,
    matchedClient?: Client,
    fallbackPhone?: string
  ) {
    if (!conversation?.id) return null;
    const contact = this.extractContact(conversation);
    if (!contact.phone && fallbackPhone) {
      contact.phone = fallbackPhone;
    }

    const clientResult = matchedClient
      ? { client: matchedClient, created: false }
      : await this.resolveClient(contact);

    const communicationType = this.mapConversationType(conversation.type);
    const latestTimestamp =
      (conversation as any)?.lastMessage?.createdAt || conversation.updatedAt || new Date().toISOString();
    const communicationDate = this.toDateOnly(latestTimestamp);
    const notes =
      this.extractConversationMessage(conversation) ||
      conversation.title ||
      `Conversation update received on ${communicationDate}`;

    const payload: CommunicationRecordInput = {
      clientId: clientResult.client.id,
      clientName: clientResult.client.client_name,
      communicationDate,
      communicationType,
      subject:
        conversation.title || `${this.titleCase(communicationType)} with ${clientResult.client.client_name}`,
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
    const participants = source.participants || [];
    const participantEntry =
      participants.find(participant => (participant as any)?.type !== 'user') || participants[0];

    const contact = source.contact || {};
    const participantName =
      typeof participantEntry === 'string'
        ? null
        : participantEntry?.displayName || (participantEntry as any)?.name || null;

    const participantPhone =
      typeof participantEntry === 'string'
        ? participantEntry
        : participantEntry?.phoneNumber || (participantEntry as any)?.number || null;

    const participantContactId =
      typeof participantEntry === 'string' ? null : participantEntry?.contactId || (participantEntry as any)?.id || null;

    const name = contact.displayName || participantName || null;
    const phone = contact.phoneNumber || participantPhone || null;
    const contactId = contact.id || participantContactId || null;
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

    const enriched = await this.enrichOpenPhoneContact({
      contactId: contact.contactId || undefined,
      phone: contact.phone || undefined,
      name: contact.name || undefined,
      email: contact.email || undefined,
    });

    client = await this.clientDbService.createClientFromOpenPhoneContact({
      name: enriched.name || contact.name || undefined,
      phone: normalizedPhone || contact.phone || undefined,
      email: enriched.email || contact.email || undefined,
      openPhoneContactId: enriched.contactId || contact.contactId || undefined,
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

  private titleCase(value: string): string {
    return value
      .split(/[\s_-]+/)
      .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }

  private extractCallSummary(call: any): string | null {
    const candidates = [
      call?.summary,
      call?.summary?.text,
      call?.summary?.content,
      call?.metadata?.summary,
      call?.metadata?.callSummary,
      call?.notes,
    ];

    for (const value of candidates) {
      const cleaned = this.toCleanString(value);
      if (cleaned) {
        return cleaned;
      }
    }

    return null;
  }

  private formatCallSummaryPayload(payload: any): string | null {
    if (!payload) {
      return null;
    }
    const summaryLines = this.toStringArray(payload.summary);
    const nextSteps = this.toStringArray(payload.nextSteps);

    const sections: string[] = [];
    if (summaryLines.length > 0) {
      sections.push(`Summary:\n- ${summaryLines.join('\n- ')}`);
    }
    if (nextSteps.length > 0) {
      sections.push(`Next Steps:\n- ${nextSteps.join('\n- ')}`);
    }

    const combined = sections.join('\n\n').trim();
    return combined || null;
  }

  private extractConversationMessage(conversation: any): string | null {
    const lastMessage = conversation?.lastMessage;
    if (!lastMessage) {
      return null;
    }

    const candidates = [
      lastMessage.text,
      lastMessage.body,
      lastMessage.message,
      lastMessage.preview,
      lastMessage.summary,
      lastMessage.content,
      Array.isArray(lastMessage.content)
        ? lastMessage.content.find((item: any) => typeof item?.text === 'string')?.text
        : lastMessage.content?.text,
    ];

    for (const value of candidates) {
      const cleaned = this.toCleanString(value);
      if (cleaned) {
        return cleaned;
      }
    }

    return null;
  }

  private toCleanString(value: any): string | null {
    if (!value) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        for (const entry of value) {
          const cleaned = this.toCleanString(entry);
          if (cleaned) return cleaned;
        }
        return null;
      }
      if (typeof value.text === 'string') {
        const trimmed = value.text.trim();
        return trimmed.length > 0 ? trimmed : null;
      }
    }
    return null;
  }

  private toStringArray(values: any): string[] {
    if (!Array.isArray(values)) {
      return [];
    }
    return values
      .map(entry => this.toCleanString(entry))
      .filter((entry): entry is string => Boolean(entry));
  }

  private async enrichOpenPhoneContact(contact: {
    contactId?: string | null;
    phone?: string | null;
    name?: string | null;
    email?: string | null;
  }): Promise<{ name?: string; email?: string; contactId?: string }> {
    let enrichedName = contact.name || null;
    let enrichedEmail = contact.email || null;
    let enrichedContactId = contact.contactId || null;

    if (enrichedContactId) {
      const remote = await this.safeGetOpenPhoneContact(enrichedContactId);
      if (remote) {
        enrichedName = enrichedName || this.formatOpenPhoneContactName(remote);
        enrichedEmail = enrichedEmail || this.extractPrimaryEmail(remote);
      }
    } else if (contact.phone) {
      const remote = await this.searchOpenPhoneContactByPhone(contact.phone);
      if (remote) {
        enrichedContactId = remote.id || enrichedContactId;
        enrichedName = enrichedName || this.formatOpenPhoneContactName(remote);
        enrichedEmail = enrichedEmail || this.extractPrimaryEmail(remote);
      }
    }

    return {
      name: enrichedName || undefined,
      email: enrichedEmail || undefined,
      contactId: enrichedContactId || undefined,
    };
  }

  private async safeGetOpenPhoneContact(contactId: string): Promise<OpenPhoneContact | null> {
    try {
      return await this.openPhoneClient.getContact(contactId);
    } catch (error) {
      console.debug('Failed to fetch OpenPhone contact', contactId, error);
      return null;
    }
  }

  private async searchOpenPhoneContactByPhone(phone: string): Promise<OpenPhoneContact | null> {
    try {
      const normalized = this.formatParticipantPhone(phone);
      if (!normalized) return null;
      const results = await this.openPhoneClient.searchContacts(normalized, 5);
      return results.find(contact =>
        contact.defaultFields?.phoneNumbers?.some(
          (item: any) => this.formatParticipantPhone(item?.value) === normalized
        )
      ) || null;
    } catch (error) {
      console.debug('Failed to search OpenPhone contact by phone', phone, error);
      return null;
    }
  }

  private formatOpenPhoneContactName(contact: OpenPhoneContact): string | null {
    const first = contact.defaultFields?.firstName;
    const last = contact.defaultFields?.lastName;
    const company = contact.defaultFields?.company;

    const parts = [first, last].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(' ').trim();
    }

    if (company && company.trim().length > 0) {
      return company.trim();
    }

    return null;
  }

  private extractPrimaryEmail(contact: OpenPhoneContact): string | null {
    const email = contact.defaultFields?.emails?.find((entry: any) => entry?.value)?.value;
    return email?.trim() || null;
  }

  private async getWorkspacePhoneNumbers(): Promise<Array<{ id: string; number: string }>> {
    if (this.phoneNumbersCache) {
      return this.phoneNumbersCache;
    }
    try {
      const response = await this.openPhoneClient.listPhoneNumbers();
      this.phoneNumbersCache =
        response.data?.map((item: any) => ({
          id: item.id,
          number: item.number,
        })) || [];
    } catch (error) {
      console.error('Failed to load OpenPhone phone numbers:', error);
      this.phoneNumbersCache = [];
    }
    return this.phoneNumbersCache;
  }

  private async fetchCallsForPair(
    phoneNumberId: string,
    participant: string,
    startIso: string,
    endIso: string,
    pageSize: number,
    matchedClient?: Client
  ): Promise<{ recordsProcessed: number; creations: number; updates: number; clientsCreated: number }> {
    let pageToken: string | undefined;
    const counters = { recordsProcessed: 0, creations: 0, updates: 0, clientsCreated: 0 };

    do {
      let response;
      try {
        const maxResults = Math.min(Math.max(pageSize, 1), 100);
        response = await this.openPhoneClient.listCalls({
          phoneNumberId,
          participants: [participant],
          createdAfter: startIso,
          createdBefore: endIso,
          maxResults,
          pageToken,
        });
      } catch (error) {
        console.warn('Failed to fetch calls for', { phoneNumberId, participant, error });
        break;
      }

      counters.recordsProcessed += response.data.length;

      for (const call of response.data) {
        const result = await this.processCallRecord(call, matchedClient, participant);
        if (result?.action === 'created') {
          counters.creations++;
        } else if (result?.action === 'updated') {
          counters.updates++;
        }
        if (result?.clientCreated) {
          counters.clientsCreated++;
        }
      }

      pageToken = response.nextPageToken || undefined;
    } while (pageToken);

    return counters;
  }

  private chunkArray<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }

  private formatParticipantPhone(phone?: string | null): string | null {
    if (!phone) return null;
    const trimmed = phone.trim();
    if (!trimmed) return null;

    const digitsOnly = trimmed.replace(/\D/g, '');
    if (!digitsOnly) return null;

    let e164Digits = digitsOnly;
    if (trimmed.startsWith('+')) {
      e164Digits = digitsOnly;
    } else if (digitsOnly.length === 10) {
      e164Digits = `1${digitsOnly}`;
    }

    const e164 = `+${e164Digits}`;
    if (e164.length < 5) {
      return null;
    }
    return e164;
  }
}

let communicationsSyncService: OpenPhoneCommunicationsSyncService | null = null;

export function getCommunicationsSyncService(): OpenPhoneCommunicationsSyncService {
  if (!communicationsSyncService) {
    communicationsSyncService = new OpenPhoneCommunicationsSyncService();
  }
  return communicationsSyncService;
}
