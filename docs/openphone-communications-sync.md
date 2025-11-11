# OpenPhone Communications Sync

## Overview
- Manual importer pulls historic call summaries (`/v1/calls`) and message threads (`/v1/conversations`) in day-sized windows.
- New webhook endpoint (`/api/openphone-webhook`) accepts `call.summary.*` and `message.*` events for ongoing updates.
- Every communication row now records its `source` and the upstream OpenPhone identifiers so we can deduplicate safely.

## Manual Import API
```
POST /api/openphone-sync
{
  "action": "import-communications",
  "options": {
    "startDate": "2025-01-01",
    "endDate": "2025-01-07",
    "includeCalls": true,
    "includeMessages": true
  }
}
```
- Defaults to “yesterday → now”, calls + messages.
- Returns counts for processed calls/conversations, created/updated communications, and auto-created clients.

## Webhooks
- Configure OpenPhone/Quo to POST to `/api/openphone-webhook`.
- Set `OPENPHONE_WEBHOOK_SECRET` so we can validate signatures (header `x-openphone-signature` or `x-quo-signature`).
- Events handled:
  - `call.summary.created` → phone-call communication
  - `message.created` / `conversation.updated` → sms/email/etc. communication

## Matching Clients
1. Lookup by `openphone_contact_id` if provided.
2. Fallback to case-insensitive `client_name`.
3. Fallback to phone number matches (sanitised digits).
4. If there’s still no hit, we create a minimal client with the contact’s name/phone and store the OpenPhone contact id for next time.

## Columns Added
See `docs/openphone-sync-migration.md` for DDL covering:
- `clients.openphone_contact_id`
- `communications.source`
- `communications.openphone_call_id`
- `communications.openphone_conversation_id`
- `communications.openphone_event_timestamp`
