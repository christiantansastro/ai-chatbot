# OpenPhone Sync Schema & Data Plan

## Objectives
- Track linkage between Supabase clients and OpenPhone contacts without re-running expensive duplicate detection on every sync.
- Record when each client was last synchronised so incremental runs can deterministically resume.
- Capture a per-client sync status to aid monitoring / retries.

## Proposed Table Changes (`clients`)
| Column | Type | Notes |
| --- | --- | --- |
| `openphone_contact_id` | `uuid` or `text` | Stores the primary OpenPhone contact id created for the main client. Nullable for unsynced clients. |
| `openphone_alt_contact_1_id` | `uuid` or `text` | Optional id for first alternate contact. |
| `openphone_alt_contact_2_id` | `uuid` or `text` | Optional id for second alternate contact. |
| `last_synced_at` | `timestamptz` | Updated every time any OpenPhone contact for the client is successfully synced. |
| `sync_status` | `text` (`pending` \| `synced` \| `failed` \| `skipped`) | Current sync disposition used by dashboards + retries. |
| `sync_error` | `text` | Optional last error message (cleared on success). |

Index additions:
- `(last_synced_at)` to speed up incremental queries.
- Partial index on `(sync_status)` for quick “resync failed clients” queries.

## Migration Outline
1. **DDL**
   ```sql
   ALTER TABLE clients
     ADD COLUMN openphone_contact_id text,
     ADD COLUMN openphone_alt_contact_1_id text,
     ADD COLUMN openphone_alt_contact_2_id text,
     ADD COLUMN last_synced_at timestamptz,
     ADD COLUMN sync_status text DEFAULT 'pending',
     ADD COLUMN sync_error text;

   CREATE INDEX clients_last_synced_idx ON clients (last_synced_at DESC);
   CREATE INDEX clients_sync_status_idx ON clients (sync_status) WHERE sync_status <> 'synced';
   ```
2. **Backfill**
   - Initialise `sync_status = 'pending'` for all rows.
   - Optionally set `last_synced_at` using existing audit logs if available; otherwise leave `NULL` and allow first sync to set it.
3. **Application updates**
   - When a contact is created or updated, store the returned OpenPhone id in the appropriate column and set `last_synced_at = now(), sync_status = 'synced', sync_error = NULL`.
   - On failure, set `sync_status = 'failed'` plus `sync_error`.
   - Incremental sync queries become `WHERE (last_synced_at IS NULL OR updated_at > last_synced_at)` which removes the need for broad duplicate scans.
4. **Reporting**
   - Expose counts by `sync_status` on monitoring endpoints.
   - Allow manual retry endpoints to reset `sync_status` back to `pending`.

## Follow-Up
- Update the Supabase schema definition in `lib/db/schema.ts`.
- Create drizzle migration scripts mirroring the SQL above.
- Extend the client database service to read/write the new columns plus helper methods (`markClientSynced`, `markClientFailed`).

## Communications Table Enhancements
| Column | Type | Notes |
| --- | --- | --- |
| `source` | `text` DEFAULT `'chatbot'` | Indicates the system that created the record (`'chatbot'`, `'Quo'`, etc.). |
| `openphone_call_id` | `text` UNIQUE | Stores the OpenPhone call identifier for deduplication. |
| `openphone_conversation_id` | `text` UNIQUE | Stores the OpenPhone conversation identifier for deduplication. |
| `openphone_event_timestamp` | `timestamptz` | Timestamp for the upstream OpenPhone event. |

Suggested DDL:
```sql
ALTER TABLE communications
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'chatbot',
  ADD COLUMN IF NOT EXISTS openphone_call_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS openphone_conversation_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS openphone_event_timestamp timestamptz;

CREATE INDEX IF NOT EXISTS idx_communications_openphone_call_id ON communications(openphone_call_id);
CREATE INDEX IF NOT EXISTS idx_communications_openphone_conversation_id ON communications(openphone_conversation_id);
```

Update any application code that inserts communications (chatbot tools, imports) so they explicitly set `source`.
