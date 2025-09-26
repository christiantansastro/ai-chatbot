# Database Abstraction Layer

This directory contains a robust, scalable database abstraction layer for integrating the Vercel AI Chatbot SDK with Supabase, supporting schema-agnostic replication for multiple clients.

## 🏗️ Architecture Overview

### Core Components

- **Database Adapters**: Unified interface for different database backends
- **Schema Manager**: Multi-client schema support with validation
- **Database Factory**: Singleton pattern with configuration management
- **Service Layer**: High-level operations with schema-aware data handling

### Supported Databases

- ✅ **Supabase** (Primary) - Cloud-native PostgreSQL with real-time features
- ✅ **PostgreSQL** (Secondary) - Traditional PostgreSQL for migration compatibility

## 🚀 Quick Start

### 1. Set Up Database Schema

Run the setup script to get detailed instructions:

```bash
npx tsx lib/db/setup-database.ts
```

Or manually set up your Supabase database:

1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/cjnlozxpzuensydxjyqd)
2. Navigate to SQL Editor
3. Copy and paste the SQL from `lib/db/setup-supabase.sql`
4. Click "Run" to execute

### 2. Test the Implementation

Run the comprehensive test suite:

```bash
npx tsx lib/db/test-database.ts
```

Expected results: ✅ 5/5 tests passing

### 3. Use in Your Application

```typescript
import { databaseService } from '@/lib/db/database-factory';

// Initialize with your Supabase credentials
await databaseService.initialize({
  type: 'supabase',
  url: 'https://cjnlozxpzuensydxjyqd.supabase.co',
  key: 'your-anon-key',
  clientId: 'default'
});

// All database operations work seamlessly
const chats = await databaseService.getChatsByUserId(userId);
const messages = await databaseService.getMessagesByChatId(chatId);
await databaseService.saveChat(newChatData);
```

## 📁 File Structure

```
lib/db/
├── adapters/
│   ├── base.adapter.ts      # Database adapter interface
│   ├── supabase.adapter.ts  # Supabase implementation
│   ├── postgresql.adapter.ts # PostgreSQL implementation
│   └── types.ts             # TypeScript definitions
├── schema-manager.ts        # Multi-client schema management
├── database-factory.ts      # Database service factory
├── test-database.ts         # Comprehensive test suite
├── setup-supabase.sql       # Database schema setup
├── setup-database.ts        # Setup instructions script
└── README.md               # This documentation
```

## 🔧 Configuration

### Environment Variables

Add these to your `.env.local`:

```env
# Supabase Configuration
SUPABASE_URL=https://cjnlozxpzuensydxjyqd.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Database Configuration
DATABASE_TYPE=supabase
CLIENT_ID=default

# Security Configuration
ENCRYPTION_KEY=your-encryption-key-here-minimum-32-chars
JWT_SECRET=your-jwt-secret-here-minimum-32-chars

# Performance Configuration
CACHE_TTL=300
MAX_CONNECTIONS=10
```

### Multi-Client Setup

The system supports multiple client schemas simultaneously:

```typescript
// Register a new client schema
const schemaManager = databaseService.getSchemaManager();
schemaManager.registerClientSchema('client_1', {
  clientId: 'client_1',
  version: '1.0.0',
  tables: {
    clients: { /* client-specific fields */ },
    financials: { /* client-specific fields */ },
    communications: { /* client-specific fields */ }
  }
});

// Data automatically adapts to the correct schema
const adaptedData = schemaManager.adaptChatData(chatData, 'client_1');
```

## 🧪 Testing

### Run All Tests

```bash
npx tsx lib/db/test-database.ts
```

### Test Individual Components

```typescript
import {
  testDatabaseConnection,
  testSchemaManagement,
  testDatabaseOperations,
  testMultiClientSupport,
  testErrorHandling
} from './lib/db/test-database';

// Test specific functionality
await testDatabaseConnection();
await testSchemaManagement();
```

### Expected Test Results

| Component | Status | Description |
|-----------|--------|-------------|
| Database Connection | ✅ PASSED | Successfully connects to Supabase |
| Schema Management | ✅ PASSED | Schema validation working correctly |
| Multi-Client Support | ✅ PASSED | Multiple client schemas supported |
| Error Handling | ✅ PASSED | Proper validation and error handling |
| Database Operations | ✅ PASSED | Full CRUD operations functional |

## 🔒 Security Features

### Row Level Security (RLS)

All tables have RLS enabled with policies ensuring:
- Users can only access their own data
- Automatic user isolation
- Secure multi-tenant architecture

### Data Validation

- Schema validation for all data operations
- Type checking and sanitization
- Protection against invalid data insertion

### Encryption Ready

The architecture is prepared for:
- Field-level encryption
- Secure key management
- Encrypted data storage

## ⚡ Performance Features

### Connection Management

- Efficient connection pooling
- Health checks and automatic recovery
- Connection monitoring and diagnostics

### Query Optimization

- Optimized indexes on frequently queried columns
- Pagination support for large datasets
- Batch operations for bulk data processing

### Caching Ready

- Built-in support for multi-layer caching
- Redis integration ready
- Query result caching support

## 📊 Schema Compatibility

### Vercel AI Chatbot SDK

The database schema is fully compatible with:
- Vercel AI Chatbot SDK message formats
- Chat history and user management
- Document and suggestion systems
- Vote and feedback mechanisms

### Multi-Client Support

- Schema-agnostic data handling
- Automatic data transformation between schemas
- Client-specific validation rules
- Version management and migration support

## 🔄 Migration from PostgreSQL

### Gradual Migration Strategy

1. **Phase 1**: Run both databases in parallel
2. **Phase 2**: Use abstraction layer for data synchronization
3. **Phase 3**: Gradual migration with rollback capability
4. **Phase 4**: Full cutover to Supabase

### Migration Benefits

- Zero downtime migration
- Rollback capability at any point
- Gradual data transfer
- Schema compatibility maintained

## 🚀 Production Deployment

### Environment Configuration

```typescript
// Production configuration
await databaseService.initialize({
  type: 'supabase',
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_ANON_KEY,
  clientId: process.env.CLIENT_ID || 'default'
});
```

### Monitoring and Alerts

- Database performance monitoring
- Error tracking and alerting
- Usage metrics and analytics
- Automated health checks

## 🛠️ Development Workflow

### Adding New Features

1. Update database adapters for new operations
2. Add schema definitions for new tables
3. Update TypeScript types
4. Add tests for new functionality
5. Update documentation

### Schema Changes

1. Create new schema version
2. Update schema manager
3. Add migration scripts
4. Test with existing data
5. Deploy changes

## 📈 Scaling Considerations

### Horizontal Scaling

- Load balancing across multiple database instances
- Read replicas for improved performance
- Connection pooling for high concurrency

### Data Partitioning

- Client-based data partitioning
- Time-based data archiving
- Efficient data cleanup strategies

## 🔍 Troubleshooting

### Common Issues

1. **Connection Errors**: Check Supabase credentials and network connectivity
2. **Schema Validation Errors**: Verify data format matches schema requirements
3. **Performance Issues**: Check indexes and query optimization
4. **RLS Policy Errors**: Ensure user authentication is properly configured

### Debug Mode

Enable debug logging:

```typescript
// Add debug configuration
const config = {
  type: 'supabase',
  url: 'https://...',
  key: '...',
  debug: true // Enable debug logging
};
```

## 📚 Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Vercel AI Chatbot SDK](https://chat-sdk.dev/)
- [Database Design Best Practices](https://supabase.com/docs/guides/database)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)

## 🤝 Contributing

When contributing to the database layer:

1. Maintain backward compatibility
2. Add comprehensive tests
3. Update documentation
4. Follow TypeScript best practices
5. Consider multi-client impact

---

**Status**: ✅ Production Ready

The database abstraction layer is fully implemented, tested, and ready for production use with support for schema-agnostic replication and multi-client architectures.