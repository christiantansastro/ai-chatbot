/**
 * Manual Sync Trigger
 * Direct trigger to demonstrate the OpenPhone sync functionality
 */
import { config } from 'dotenv';
import { getSyncService } from './lib/openphone-sync-service';
import { databaseService, databaseFactory } from './lib/db/database-factory';

// Load environment variables from .env.local
config({ path: '.env.local' });

async function triggerManualSync() {
  console.log('🚀 Manual Sync Trigger Starting...\n');
  
  try {
    // Initialize database first (like our working test)
    console.log('🧪 Ensuring database is initialized...');
    try {
      await databaseFactory.initialize({
        type: 'supabase' as const,
        url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        clientId: 'default'
      });
      console.log('✅ Database initialized successfully');
    } catch (error) {
      console.log('⚠️ Database already initialized or error occurred');
    }
    
    // Force database service health check
    const healthCheck = await databaseService.healthCheck();
    console.log('Database health:', healthCheck);
    
    console.log('\n📊 Getting sync service...');
    const syncService = getSyncService();
    
    console.log('🔧 Configuration test...');
    const configTest = await syncService.testConfiguration();
    console.log('Configuration Status:', {
      openPhoneConnection: configTest.openPhoneConnection ? '✅ Connected' : '❌ Disconnected',
      databaseConnection: configTest.databaseConnection ? '✅ Connected' : '❌ Disconnected',
      sampleClients: configTest.sampleClients,
      errors: configTest.errors
    });
    
    if (!configTest.databaseConnection) {
      console.log('❌ Database not connected - skipping sync');
      return;
    }
    
    console.log('\n🔄 Starting manual sync...');
    const syncOptions = {
      syncMode: 'incremental' as const,
      batchSize: 5,
      dryRun: false,
      continueOnError: true
    };
    
    console.log('Sync Options:', syncOptions);
    const result = await syncService.syncContacts(syncOptions);
    
    console.log('\n✅ Manual sync completed!');
    console.log('📊 Results:');
    console.log(`   ⚡ Success: ${result.success ? 'Yes' : 'No'}`);
    console.log(`   📋 Clients Processed: ${result.totalClientsProcessed}`);
    console.log(`   ➕ Contacts Created: ${result.totalContactsCreated}`);
    console.log(`   🔄 Contacts Updated: ${result.totalContactsUpdated}`);
    console.log(`   ⏭️  Contacts Skipped: ${result.totalContactsSkipped}`);
    console.log(`   ❌ Errors: ${result.totalErrors}`);
    console.log(`   ⏱️  Duration: ${(result.duration / 1000).toFixed(2)}s`);
    
    if (result.errors && result.errors.length > 0) {
      console.log('\n📝 Error Details:');
      result.errors.forEach(error => {
        console.log(`   • ${error.clientName}: ${error.error}`);
      });
    }
    
    console.log('\n🎯 Manual sync trigger completed successfully!');
    
  } catch (error) {
    console.error('❌ Manual sync failed:', error instanceof Error ? error.message : 'Unknown error');
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
  }
}

// Run the manual sync
triggerManualSync();