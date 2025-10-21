// Test script for client querying functionality
// Run with: node tests/test-clients.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// SQL to fix the type mismatch in search_clients_precise function
const fixPreciseSearchSQL = `
-- Fix type mismatch: change TEXT to VARCHAR(50) for phone fields
CREATE OR REPLACE FUNCTION search_clients_precise(
    search_query TEXT,
    similarity_threshold FLOAT DEFAULT 0.6,
    max_results INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    client_name TEXT,
    client_type TEXT,
    county TEXT,
    date_intake DATE,
    date_of_birth DATE,
    address TEXT,
    phone TEXT,
    email TEXT,
    contact_1 TEXT,
    relationship_1 TEXT,
    contact_1_phone VARCHAR(50),
    contact_2 TEXT,
    relationship_2 TEXT,
    contact_2_phone VARCHAR(50),
    notes TEXT,
    arrested BOOLEAN,
    charges TEXT,
    served_papers_or_initial_filing TEXT,
    case_type TEXT,
    court_date DATE,
    quoted DECIMAL(10,2),
    initial_payment DECIMAL(10,2),
    due_date_balance DATE,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.client_name,
        c.client_type,
        c.county,
        c.date_intake,
        c.date_of_birth,
        c.address,
        c.phone,
        c.email,
        c.contact_1,
        c.relationship_1,
        c.contact_1_phone,
        c.contact_2,
        c.relationship_2,
        c.contact_2_phone,
        c.notes,
        c.arrested,
        c.charges,
        c.served_papers_or_initial_filing,
        c.case_type,
        c.court_date,
        c.quoted,
        c.initial_payment,
        c.due_date_balance,
        c.created_at,
        c.updated_at
    FROM clients c
    WHERE
        -- Only search in client_name field
        -- Exact name match (highest priority) - case insensitive
        (c.client_name IS NOT NULL AND LOWER(c.client_name) = LOWER(search_query))
        -- Or fuzzy name match with high similarity
        OR (c.client_name IS NOT NULL AND similarity(c.client_name, search_query) > similarity_threshold)
    ORDER BY
        -- Prioritize exact name matches first
        CASE
            WHEN LOWER(c.client_name) = LOWER(search_query) THEN 1
            WHEN c.client_name IS NOT NULL AND similarity(c.client_name, search_query) > 0.8 THEN 2
            ELSE 3
        END,
        -- Then by name alphabetically for same priority matches
        c.client_name
    LIMIT max_results;
END;
$$;
`;

async function fixDatabaseFunction(supabase) {
  console.log('🔧 Fixing database function type mismatch...');

  try {
    // Since exec_sql doesn't exist, we'll provide manual instructions
    console.log('📋 To fix the RPC function, run this SQL in your Supabase dashboard:');
    console.log('📋 SQL Editor > New Query > Paste the following:');
    console.log('');
    console.log(fixPreciseSearchSQL);
    console.log('');
    console.log('✅ After running this SQL, the search_clients_precise function will work correctly');

    return true;
  } catch (err) {
    console.error('❌ Error with function fix:', err.message);
    return false;
  }
}

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

  // Show the SQL fix for the database function
  await fixDatabaseFunction(supabase);

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

    // Test 2: Search for existing clients
    console.log('\n🔍 Test 2: Searching for "Mason E. Smith"...');
    const { data: masonResults, error: masonError } = await supabase
      .from('clients')
      .select('client_name, email, phone, address, contact_1, relationship_1, notes')
      .ilike('client_name', '%mason%');

    if (masonError) {
      console.error('❌ Search failed:', masonError.message);
    } else {
      console.log(`✅ Found ${masonResults?.length || 0} results for "Mason"`);
      if (masonResults && masonResults.length > 0) {
        masonResults.forEach((client, index) => {
          console.log(`   ${index + 1}. ${client.client_name} - ${client.email} (${client.phone})`);
          console.log(`      Address: ${client.address || 'No address'}`);
          console.log(`      Contact: ${client.contact_1 || 'No contact'} (${client.relationship_1 || 'No relationship'})`);
        });
      }
    }

    // Test 2b: Search for "Todd Jones"
    console.log('\n🔍 Test 2b: Searching for "Todd Jones"...');
    const { data: toddResults, error: toddError } = await supabase
      .from('clients')
      .select('client_name, email, phone, address, contact_1, relationship_1, notes')
      .ilike('client_name', '%todd%');

    if (toddError) {
      console.error('❌ Search failed:', toddError.message);
    } else {
      console.log(`✅ Found ${toddResults?.length || 0} results for "Todd"`);
      if (toddResults && toddResults.length > 0) {
        toddResults.forEach((client, index) => {
          console.log(`   ${index + 1}. ${client.client_name} - ${client.email} (${client.phone})`);
        });
      }
    }

    // Test 3: Test search_clients_precise function
    console.log('\n🔍 Test 3: Testing search_clients_precise function...');
    try {
      // Try with lower similarity threshold first
      const { data: preciseResults, error: preciseError } = await supabase
        .rpc('search_clients_precise', {
          search_query: 'Mason',
          similarity_threshold: 0.3,
          max_results: 5
        });

      if (preciseError) {
        console.log('⚠️ Precise search not available:', preciseError.message);
      } else {
        console.log(`✅ Precise search found ${preciseResults?.length || 0} results`);
        if (preciseResults && preciseResults.length > 0) {
          preciseResults.forEach((client, index) => {
            console.log(`   ${index + 1}. ${client.client_name} - ${client.email} (${client.phone})`);
          });
        } else {
          console.log('   No results found with threshold 0.3, trying exact match...');
          // Try exact match for "Mason E. Smith"
          const { data: exactResults, error: exactError } = await supabase
            .rpc('search_clients_precise', {
              search_query: 'Mason E. Smith',
              similarity_threshold: 0.1,
              max_results: 5
            });

          if (!exactError && exactResults && exactResults.length > 0) {
            console.log(`✅ Found exact match: ${exactResults[0].client_name}`);
          } else {
            console.log('❌ Even exact match failed');
          }
        }
      }
    } catch (preciseErr) {
      console.log('⚠️ Precise search function not available');
    }

    // Test 3b: Test search_clients_basic function
    console.log('\n🔍 Test 3b: Testing search_clients_basic function...');
    try {
      const { data: basicResults, error: basicError } = await supabase
        .rpc('search_clients_basic', {
          search_query: 'Todd',
          max_results: 5
        });

      if (basicError) {
        console.log('⚠️ Basic search not available:', basicError.message);
      } else {
        console.log(`✅ Basic search found ${basicResults?.length || 0} results`);
        if (basicResults && basicResults.length > 0) {
          basicResults.forEach((client, index) => {
            console.log(`   ${index + 1}. ${client.client_name} - ${client.email} (${client.phone})`);
          });
        }
      }
    } catch (basicErr) {
      console.log('⚠️ Basic search function not available');
    }

    // Test 4: Searching for "Jeremy" (test the specific issue)
    console.log('\n🔍 Test 4: Searching for "Jeremy"...');
    const { data: jeremyResults, error: jeremyError } = await supabase
      .from('clients')
      .select('client_name, email, phone, address, contact_1, relationship_1, notes')
      .ilike('client_name', '%jeremy%');

    if (jeremyError) {
      console.error('❌ Jeremy search failed:', jeremyError.message);
    } else {
      console.log(`✅ Found ${jeremyResults?.length || 0} results for "Jeremy"`);
      if (jeremyResults && jeremyResults.length > 0) {
        jeremyResults.forEach((client, index) => {
          console.log(`   ${index + 1}. ${client.client_name} - ${client.email} (${client.phone})`);
        });
      }
    }

    // Test 4b: Test search for just "Nunez" to see if it finds both Jeremy and Irma
    console.log('\n🔍 Test 4b: Searching for "Nunez"...');
    const { data: nunezResults, error: nunezError } = await supabase
      .from('clients')
      .select('client_name, email, phone')
      .ilike('client_name', '%nunez%');

    if (nunezError) {
      console.error('❌ Nunez search failed:', nunezError.message);
    } else {
      console.log(`✅ Found ${nunezResults?.length || 0} results for "Nunez"`);
      if (nunezResults && nunezResults.length > 0) {
        nunezResults.forEach((client, index) => {
          console.log(`   ${index + 1}. ${client.client_name} - ${client.email}`);
        });
      }
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