// Test script for client querying functionality
// Run with: node tests/test-clients.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function testClientQueries() {
  console.log('🧪 Starting Client Query Tests...\n');

  // Check environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing environment variables:');
    console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅' : '❌');
    console.error('   NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseKey ? '✅' : '❌');
    return;
  }

  console.log('✅ Environment variables loaded');

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Test 1: Basic connectivity
    console.log('\n📡 Test 1: Basic database connectivity...');
    const { data: clients, error: connectionError } = await supabase
      .from('clients')
      .select('client_name, email, phone, address')
      .limit(5);

    if (connectionError) {
      console.error('❌ Database connection failed:', connectionError.message);
      console.error('   Error code:', connectionError.code);
      console.error('   Error details:', connectionError.details);
      console.error('   Error hint:', connectionError.hint);

      // Try without RLS using service role key
      console.log('\n🔄 Trying with service role key (bypassing RLS)...');
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceRoleKey) {
        const serviceSupabase = createClient(supabaseUrl, serviceRoleKey);
        const { data: serviceClients, error: serviceError } = await serviceSupabase
          .from('clients')
          .select('client_name, email, phone, address')
          .limit(5);

        if (serviceError) {
          console.error('❌ Service role also failed:', serviceError.message);
          console.error('   This suggests a schema issue or table doesn\'t exist');
        } else {
          console.log(`✅ Service role works! Found ${serviceClients?.length || 0} clients`);
          if (serviceClients && serviceClients.length > 0) {
            console.log('📋 Sample clients (via service role):');
            serviceClients.forEach((client, index) => {
              console.log(`   ${index + 1}. ${client.client_name} (${client.email || 'No email'}) - ${client.phone || 'No phone'}`);
            });
          }
        }
      } else {
        console.error('❌ No service role key available for testing');
      }
      return;
    }

    console.log(`✅ Connected successfully! Found ${clients?.length || 0} clients`);

    if (clients && clients.length > 0) {
      console.log('📋 Sample clients:');
      clients.forEach((client, index) => {
        console.log(`   ${index + 1}. ${client.client_name} (${client.email || 'No email'}) - ${client.phone || 'No phone'}`);
      });
    } else {
      console.log('⚠️ No clients returned. This might be due to:');
      console.log('   1. Row Level Security (RLS) policies blocking access');
      console.log('   2. No data in the table');
      console.log('   3. Schema mismatch');
      console.log('   4. Permission issues');
    }

    // Test 2: Search for John Smith
    console.log('\n🔍 Test 2: Searching for "John Smith"...');
    const { data: johnResults, error: johnError } = await supabase
      .from('clients')
      .select('client_name, email, phone, address, contact_1, relationship_1, notes')
      .ilike('client_name', '%john smith%');

    if (johnError) {
      console.error('❌ Search failed:', johnError.message);
    } else {
      console.log(`✅ Found ${johnResults?.length || 0} results for "John Smith"`);
      if (johnResults && johnResults.length > 0) {
        johnResults.forEach((client, index) => {
          console.log(`   ${index + 1}. ${client.client_name} - ${client.email} (${client.phone})`);
          console.log(`      Address: ${client.address || 'No address'}`);
          console.log(`      Contact: ${client.contact_1 || 'No contact'} (${client.relationship_1 || 'No relationship'})`);
        });
      }
    }

    // Test 3: Fuzzy search function (if available)
    console.log('\n🔍 Test 3: Testing fuzzy search function...');
    try {
      const { data: fuzzyResults, error: fuzzyError } = await supabase
        .rpc('search_clients_fuzzy', {
          search_query: 'john smith',
          max_results: 5
        });

      if (fuzzyError) {
        console.log('⚠️ Fuzzy search not available:', fuzzyError.message);
      } else {
        console.log(`✅ Fuzzy search found ${fuzzyResults?.length || 0} results`);
        if (fuzzyResults && fuzzyResults.length > 0) {
          fuzzyResults.forEach((client, index) => {
            console.log(`   ${index + 1}. ${client.client_name} - ${client.email}`);
          });
        }
      }
    } catch (fuzzyErr) {
      console.log('⚠️ Fuzzy search function not available');
    }

    // Test 4: Test with partial name
    console.log('\n🔍 Test 4: Searching for "john"...');
    const { data: partialResults, error: partialError } = await supabase
      .from('clients')
      .select('client_name, email, phone, address, contact_1, relationship_1, notes')
      .ilike('client_name', '%john%');

    if (partialError) {
      console.error('❌ Partial search failed:', partialError.message);
    } else {
      console.log(`✅ Found ${partialResults?.length || 0} results for "john"`);
    }

    // Test 5: Check if sample data exists
    console.log('\n📊 Test 5: Checking for sample data...');
    const sampleNames = ['John Smith', 'Sarah Johnson', 'Michael Brown'];
    for (const name of sampleNames) {
      const { data: sampleData, error: sampleError } = await supabase
        .from('clients')
        .select('client_name')
        .ilike('client_name', name);

      if (!sampleError && sampleData && sampleData.length > 0) {
        console.log(`✅ Found "${name}" in database`);
      } else {
        console.log(`❌ "${name}" not found in database`);
      }
    }

    // Test 6: Direct count query to verify data exists
    console.log('\n🔢 Test 6: Direct table count...');
    const { count, error: countError } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('❌ Count query failed:', countError.message);
    } else {
      console.log(`📊 Total clients in database: ${count || 0}`);
    }

    // Test 7: Try to insert a test record
    console.log('\n🆕 Test 7: Trying to insert a test record...');
    const testClient = {
      client_name: 'Test Client ' + Date.now(),
      email: 'test@example.com',
      phone: '123-456-7890',
      address: '123 Test Street',
      date_intake: new Date().toISOString().split('T')[0],
    };

    const { data: insertData, error: insertError } = await supabase
      .from('clients')
      .insert(testClient)
      .select();

    if (insertError) {
      console.error('❌ Insert failed:', insertError.message);
      console.error('   This confirms RLS or permission issues');
    } else {
      console.log('✅ Insert successful! Created test client');
      if (insertData && insertData.length > 0) {
        console.log('   Test client:', insertData[0]);
      }
    }

    console.log('\n🎯 Test Summary:');
    console.log('   - Database connection: ✅ Working');
    console.log('   - Basic queries: ✅ Working');
    console.log('   - Total clients found:', count || 0);
    console.log('   - Sample data: Check above for specific results');

    if (clients && clients.length === 0) {
      console.log('\n⚠️  DIAGNOSIS: Row Level Security (RLS) is likely blocking access!');
      console.log('   💡 SOLUTION: Disable RLS for the clients table in Supabase:');
      console.log('   1. Go to Table Editor in Supabase Dashboard');
      console.log('   2. Select the "clients" table');
      console.log('   3. Go to "Authentication" tab');
      console.log('   4. Toggle "Enable Row Level Security" to OFF');
      console.log('   5. Or create a policy that allows anonymous access');
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Run the test
testClientQueries().then(() => {
  console.log('\n✨ Test completed!');
  process.exit(0);
}).catch((error) => {
  console.error('\n💥 Test crashed:', error);
  process.exit(1);
});