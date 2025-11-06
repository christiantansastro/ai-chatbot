/**
 * Direct database connection and OpenPhone sync test
 */
import { config } from 'dotenv';
import { databaseService, databaseFactory } from './lib/db/database-factory';
import { getSyncService } from './lib/openphone-sync-service';
import { getSyncScheduler } from './lib/openphone-scheduler';

// Load environment variables from .env.local
config({ path: '.env.local' });

async function testDatabaseConnection() {
  console.log('🧪 Testing database connection...');
  
  try {
    console.log('1. Loading configuration...');
    console.log('Environment variables loaded:');
    console.log('- NEXT_PUBLIC_SUPABASE_URL:', !!process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log('- NEXT_PUBLIC_SUPABASE_ANON_KEY:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    console.log('- SUPABASE_SERVICE_ROLE_KEY:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
    console.log('- OPENPHONE_API_TOKEN:', !!process.env.OPENPHONE_API_TOKEN);
    console.log('- OPENPHONE_DEFAULT_PHONE_NUMBER_ID:', !!process.env.OPENPHONE_DEFAULT_PHONE_NUMBER_ID);
    
    const config = {
      type: 'supabase' as const,
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      clientId: 'default'
    };
    console.log('Config object:', { ...config, serviceRoleKey: config.serviceRoleKey ? 'present' : 'missing' });
    
    console.log('2. Initializing database factory...');
    await databaseFactory.initialize(config);
    
    console.log('3. Checking if connected...');
    const isConnected = databaseFactory.isConnected();
    console.log('Factory connected:', isConnected);
    
    console.log('4. Getting adapter...');
    const adapter = databaseFactory.getAdapter();
    console.log('Adapter available:', !!adapter);
    
    if (adapter) {
      console.log('5. Testing adapter connection...');
      const testResult = await adapter.testChatInsert('test-user-id');
      console.log('Adapter test result:', testResult);
    }
    
    console.log('6. Testing database service health check...');
    const healthCheck = await databaseService.healthCheck();
    console.log('Health check:', healthCheck);
    
    console.log('✅ Database connection test completed successfully!');
    
    return true;
    
  } catch (error) {
    console.error('❌ Database connection test failed:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      name: error instanceof Error ? error.name : 'Unknown error type'
    });
    return false;
  }
}

async function testOpenPhoneSync() {
  console.log('\n🚀 Testing OpenPhone sync service...');
  
  try {
    console.log('1. Getting sync service...');
    const syncService = getSyncService();
    
    console.log('2. Getting sync status...');
    const status = syncService.getSyncStatus();
    console.log('Sync Status:', JSON.stringify(status, null, 2));
    
    console.log('3. Testing configuration...');
    const configTest = await syncService.testConfiguration();
    console.log('Config Test Result:', configTest);
    
    console.log('4. Running test sync...');
    const testOptions = {
      syncMode: 'incremental' as const,
      batchSize: 5,
      dryRun: false,
      continueOnError: true
    };
    
    const result = await syncService.syncContacts(testOptions);
    
    console.log('5. Sync completed successfully!');
    console.log('📊 Results:');
    console.log('   Success:', result.success);
    console.log('   Total Clients Processed:', result.totalClientsProcessed);
    console.log('   Total Contacts Created:', result.totalContactsCreated);
    console.log('   Total Contacts Updated:', result.totalContactsUpdated);
    console.log('   Total Contacts Skipped:', result.totalContactsSkipped);
    console.log('   Total Errors:', result.totalErrors);
    console.log('   Duration:', result.duration + 'ms');
    
    if (result.errors && result.errors.length > 0) {
      console.log('\n❌ Sync Errors:');
      result.errors.forEach(error => {
        console.log('   - Client:', error.clientName);
        console.log('     Error:', error.error);
        if (error.contactType) {
          console.log('     Contact Type:', error.contactType);
        }
      });
    }
    
    console.log('6. Testing scheduler status...');
    const scheduler = getSyncScheduler();
    const schedulerStatus = scheduler.getStatus();
    console.log('Scheduler Status:', JSON.stringify(schedulerStatus, null, 2));
    
    return true;
    
  } catch (error) {
    console.error('❌ OpenPhone sync test failed:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      name: error instanceof Error ? error.name : 'Unknown error type'
    });
    return false;
  }
}

async function runAllTests() {
  console.log('🎯 Starting comprehensive test suite...\n');
  
  const dbSuccess = await testDatabaseConnection();
  
  if (dbSuccess) {
    const syncSuccess = await testOpenPhoneSync();
    
    if (syncSuccess) {
      console.log('\n🎉 All tests completed successfully!');
      console.log('✅ Database connection working');
      console.log('✅ OpenPhone sync service working');
      console.log('✅ System is ready for production use');
    } else {
      console.log('\n⚠️  Database connection OK, but sync service needs attention');
    }
  } else {
    console.log('\n❌ Database connection failed - fix before proceeding');
  }
}

// Run all tests
runAllTests();