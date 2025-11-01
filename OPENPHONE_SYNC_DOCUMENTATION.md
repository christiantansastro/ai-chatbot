# OpenPhone Contact Sync Solution

This comprehensive solution synchronizes client data from your Supabase database to OpenPhone contacts, including alternative contacts with the specified naming convention.

## Features

### Contact Sync Logic
- **Main Client Contacts**: Created with just the client name (e.g., "James")
- **Alternative Contacts**: Created with naming convention "ClientName - Relationship" (e.g., "James - Brother")
- **Data Preservation**: Original alternative contact names stored in custom fields
- **Duplicate Prevention**: Smart detection using external IDs, phone numbers, and name similarity

### Automation & Monitoring
- **Daily Sync**: Automatically runs at 2 AM daily (configurable)
- **Manual Triggers**: API endpoints for on-demand synchronization
- **Real-time Progress**: Live progress tracking and status monitoring
- **Comprehensive Logging**: Detailed logs for troubleshooting
- **Error Handling**: Robust error handling with continue-on-error options

### Performance & Reliability
- **Rate Limiting**: Respects OpenPhone API quotas
- **Batch Processing**: Efficient handling of large client bases
- **Caching**: Duplicate detection caching for performance
- **Rollback Support**: Built-in retry mechanisms

## Architecture

```
Supabase Database → Client Database Service → OpenPhone Mapping → Sync Service → OpenPhone API
                    ↓
                Duplicate Detection Service
                    ↓
                Scheduler (Daily Cron) + API Endpoints
```

## Installation & Setup

### 1. Environment Configuration

Add these environment variables to your `.env.local` file:

```bash
# OpenPhone API Configuration
OPENPHONE_API_KEY=sk-your-openphone-api-key
OPENPHONE_BASE_URL=https://api.openphone.com

# Sync Configuration
OPENPHONE_SYNC_SCHEDULE=0 2 * * *  # 2 AM daily
OPENPHONE_BATCH_SIZE=50
OPENPHONE_RETRY_ATTEMPTS=3
OPENPHONE_RETRY_DELAY=1000

# Rate Limiting
OPENPHONE_RATE_LIMIT_MINUTE=60
OPENPHONE_RATE_LIMIT_HOUR=3600
OPENPHONE_TIMEOUT=30000

# Monitoring
OPENPHONE_ENABLE_LOGGING=true
OPENPHONE_ALERT_ON_FAILURE=true

# Database (if different from default)
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

### 2. API Key Setup

1. **Get OpenPhone API Key**: Log into your OpenPhone account and generate an API key from the developer settings
2. **Verify Permissions**: Ensure your API key has permissions for:
   - Creating contacts
   - Updating contacts
   - Reading contacts
   - Searching contacts

### 3. Database Schema Compatibility

The sync service works with your existing `Client` table schema. Ensure your table includes:

```sql
-- Required fields
client_name (varchar)
phone (varchar)
client_type (varchar) -- 'criminal' or 'civil'

-- Alternative contacts (optional but recommended)
contact_1 (varchar)
relationship_1 (varchar)
contact_1_phone (varchar)
contact_2 (varchar)
relationship_2 (varchar)
contact_2_phone (varchar)

-- Additional fields (mapped to custom fields)
email (varchar)
date_of_birth (date)
county (varchar)
date_intake (date)
case_type (varchar) -- for civil cases
arrested (boolean) -- for criminal cases
currently_incarcerated (boolean) -- for criminal cases
```

## Usage

### API Endpoints

#### Get Sync Status
```bash
GET /api/openphone-sync?action=status
```

Response:
```json
{
  "syncService": {
    "isInProgress": false
  },
  "scheduler": {
    "jobId": "openphone-daily-sync",
    "status": "idle",
    "isEnabled": true,
    "nextRun": "2025-11-01T02:00:00.000Z"
  },
  "schedulerMetrics": {
    "totalRuns": 0,
    "successfulRuns": 0,
    "failedRuns": 0
  }
}
```

#### Trigger Manual Sync
```bash
POST /api/openphone-sync
{
  "action": "sync",
  "options": {
    "syncMode": "incremental", // or "full"
    "batchSize": 50,
    "clientType": "criminal", // optional filter
    "dryRun": false, // test without actually creating contacts
    "continueOnError": true
  }
}
```

#### Start/Stop Scheduler
```bash
POST /api/openphone-sync
{
  "action": "start-scheduler"
}

POST /api/openphone-sync
{
  "action": "stop-scheduler"
}
```

#### Get Sync Metrics
```bash
GET /api/openphone-sync?action=metrics
```

#### Test Configuration
```bash
GET /api/openphone-sync?action=test
```

### Manual Integration

```typescript
import { getSyncService } from '../lib/openphone-sync-service';
import { getSyncScheduler } from '../lib/openphone-scheduler';

// Trigger sync manually
const syncService = getSyncService();
const result = await syncService.syncContacts({
  syncMode: 'incremental',
  batchSize: 50,
  continueOnError: true
});

console.log('Sync result:', result);

// Use scheduler for automated daily syncs
const scheduler = getSyncScheduler();
await scheduler.start();
```

## Data Mapping

### Main Client Contact
```json
{
  "defaultFields": {
    "firstName": "James Smith",
    "phoneNumbers": [{
      "name": "Main Phone",
      "value": "+1234567890",
      "id": "generated-id"
    }],
    "company": "Legal Client",
    "role": "Criminal Client"
  },
  "customFields": [
    {"name": "Client Type", "key": "client_type", "type": "text", "value": "criminal"},
    {"name": "Date of Birth", "key": "date_of_birth", "type": "date", "value": "1985-06-15"},
    {"name": "County", "key": "county", "type": "text", "value": "Los Angeles County"}
  ],
  "externalId": "client_123e4567-e89b-12d3-a456-426614174000",
  "source": "legal-practitioner-app"
}
```

### Alternative Contact
```json
{
  "defaultFields": {
    "firstName": "James Smith - Brother",
    "phoneNumbers": [{
      "name": "Brother Phone",
      "value": "+1234567891",
      "id": "generated-id"
    }],
    "company": "Legal Client Contact",
    "role": "Alternative Contact (Brother)"
  },
  "customFields": [
    {"name": "Client Name", "key": "primary_client_name", "type": "text", "value": "James Smith"},
    {"name": "Relationship to Client", "key": "relationship", "type": "text", "value": "Brother"},
    {"name": "Contact Person Name", "key": "contact_person_name", "type": "text", "value": "Bob Smith"},
    {"name": "Alternative Contact Number", "key": "alt_contact_number", "type": "text", "value": "1"}
  ],
  "externalId": "client_123e4567-e89b-12d3-a456-426614174000_alt_1",
  "source": "legal-practitioner-app"
}
```

## Monitoring & Troubleshooting

### Logs Location
- Application logs: Check your Next.js application logs
- Sync metrics: Stored in `sync_metrics_openphone-daily-sync.json` (if file storage enabled)

### Common Issues

#### API Connection Failures
```bash
# Test API connection
GET /api/openphone-sync?action=test
```

#### Rate Limiting
- The service automatically handles rate limiting
- If you hit limits, increase retry delays in environment variables
- Monitor API usage in OpenPhone dashboard

#### Duplicate Contacts
- Service uses multiple strategies to detect duplicates
- External ID matching (most reliable)
- Phone number matching
- Name similarity matching (configurable threshold)

#### Sync Failures
- Check database connection
- Verify client data completeness
- Review error logs for specific client failures
- Use dry-run mode to test without creating contacts

### Health Check Script

Create a simple health check:

```bash
#!/bin/bash
echo "🔍 OpenPhone Sync Health Check"

echo "1. Testing API connection..."
curl -s "/api/openphone-sync?action=test" | jq '.openPhoneConnection // false'

echo "2. Checking scheduler status..."
curl -s "/api/openphone-sync?action=status" | jq '.scheduler.status'

echo "3. Getting latest metrics..."
curl -s "/api/openphone-sync?action=metrics" | jq '.metrics.totalRuns'

echo "✅ Health check complete"
```

## Deployment Considerations

### Production Deployment
1. **Environment Variables**: Set all required environment variables
2. **Database Access**: Ensure service role key has proper permissions
3. **API Monitoring**: Set up alerts for sync failures
4. **Backup Strategy**: Implement backup for sync metadata and configurations

### Scaling
- **Batch Size**: Adjust `OPENPHONE_BATCH_SIZE` based on your client base
- **Rate Limits**: Monitor OpenPhone API usage and adjust limits accordingly
- **Database Optimization**: Ensure database indexes on frequently queried fields

### Security
- **API Keys**: Store OpenPhone API key securely (environment variables)
- **Database Access**: Use service role key only for server-side operations
- **Error Handling**: Don't expose sensitive data in error messages

## Testing

### Dry Run Testing
```bash
POST /api/openphone-sync
{
  "action": "sync",
  "options": {
    "dryRun": true,
    "syncMode": "full"
  }
}
```

### Configuration Testing
```bash
GET /api/openphone-sync?action=test
```

### Sample Client Data
Create test clients in your database:

```sql
INSERT INTO "Client" (
  client_name, 
  client_type, 
  phone, 
  email,
  contact_1, 
  relationship_1, 
  contact_1_phone,
  contact_2, 
  relationship_2, 
  contact_2_phone
) VALUES (
  'John Doe',
  'criminal',
  '+1234567890',
  'john@example.com',
  'Jane Doe',
  'Wife',
  '+1234567891',
  'Bob Doe',
  'Brother',
  '+1234567892'
);
```

## Support & Maintenance

### Regular Maintenance Tasks
1. **Monitor Sync Success**: Check daily that syncs complete successfully
2. **Review Error Logs**: Investigate any failed client syncs
3. **Update API Keys**: Rotate OpenPhone API keys periodically
4. **Performance Monitoring**: Track sync duration and success rates

### Backup & Recovery
- **Configuration Backup**: Regularly backup scheduler configurations
- **Contact Data**: OpenPhone serves as backup for contact data
- **Database Backup**: Ensure Supabase backups are enabled

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review OpenPhone API documentation
3. Check application logs for detailed error messages
4. Test configuration using the provided test endpoints