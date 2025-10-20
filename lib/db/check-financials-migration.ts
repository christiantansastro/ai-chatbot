// Script to check financials table status and identify clients with quotes
import { createClient } from '@supabase/supabase-js';

interface Client {
  id: string;
  client_name: string;
  quoted: string | null;
  initial_payment: string | null;
  due_date_balance: string | null;
}

interface FinancialRecord {
  id: string;
  client_id: string | null;
  client_name: string | null;
  transaction_type: string;
  amount: number;
  transaction_date: string;
  created_at: string;
}

async function checkFinancialsTable() {
  console.log('🔍 Checking financials table status...');

  try {
    // Validate environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.log('❌ Missing Supabase environment variables');
      return { exists: false, error: 'Missing Supabase credentials' };
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if financials table exists by trying to query it
    const { data: financialsData, error } = await supabase
      .from('financials')
      .select('*')
      .limit(1);

    if (error) {
      console.log('❌ Financials table does not exist or cannot be accessed:', error.message);
      return { exists: false, error: error.message };
    }

    console.log('✅ Financials table exists');
    console.log(`📊 Current financial records count: ${financialsData?.length || 0}`);

    return { exists: true, count: financialsData?.length || 0 };

  } catch (error) {
    console.log('❌ Error checking financials table:', error);
    return { exists: false, error: String(error) };
  }
}

async function findClientsWithQuotes() {
  console.log('🔍 Finding clients with quotes...');

  try {
    // Validate environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.log('❌ Missing Supabase environment variables');
      return { clients: [], error: 'Missing Supabase credentials' };
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: clients, error } = await supabase
      .from('clients')
      .select('id, client_name, quoted, initial_payment, due_date_balance')
      .not('quoted', 'is', null)
      .not('quoted', 'eq', '');

    if (error) {
      console.log('❌ Error querying clients:', error.message);
      return { clients: [], error: error.message };
    }

    console.log(`✅ Found ${clients?.length || 0} clients with quotes`);

    if (clients && clients.length > 0) {
      console.log('\n📋 Clients with quotes:');
      clients.forEach((client: Client, index: number) => {
        console.log(`${index + 1}. ${client.client_name} - Quoted: ${client.quoted}, Initial Payment: ${client.initial_payment || 'None'}`);
      });
    }

    return { clients: clients || [], count: clients?.length || 0 };

  } catch (error) {
    console.log('❌ Error finding clients with quotes:', error);
    return { clients: [], error: String(error) };
  }
}

async function checkExistingFinancialData() {
  console.log('🔍 Checking existing financial data...');

  try {
    // Validate environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.log('❌ Missing Supabase environment variables');
      return { records: [], error: 'Missing Supabase credentials' };
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: financials, error } = await supabase
      .from('financials')
      .select('*')
      .limit(10);

    if (error) {
      console.log('❌ Error querying financials:', error.message);
      return { records: [], error: error.message };
    }

    console.log(`✅ Found ${financials?.length || 0} financial records`);

    if (financials && financials.length > 0) {
      console.log('\n📋 Recent financial records:');
      financials.forEach((record: FinancialRecord, index: number) => {
        console.log(`${index + 1}. ${record.client_name} - ${record.transaction_type}: $${record.amount} (${record.transaction_date})`);
      });
    }

    return { records: financials || [], count: financials?.length || 0 };

  } catch (error) {
    console.log('❌ Error checking financial data:', error);
    return { records: [], error: String(error) };
  }
}

// Main execution function
async function main() {
  console.log('🚀 Starting financials migration check...\n');

  // Check financials table status
  const tableStatus = await checkFinancialsTable();
  console.log('');

  // Find clients with quotes
  const clientsWithQuotes = await findClientsWithQuotes();
  console.log('');

  // Check existing financial data
  const existingFinancials = await checkExistingFinancialData();
  console.log('');

  // Summary
  console.log('📊 SUMMARY:');
  console.log(`Financials table exists: ${tableStatus.exists ? '✅' : '❌'}`);
  if (tableStatus.error) console.log(`Error: ${tableStatus.error}`);
  console.log(`Clients with quotes: ${clientsWithQuotes.count}`);
  console.log(`Existing financial records: ${existingFinancials.count}`);

  const count = clientsWithQuotes.count || 0;
  if (count > 0 && count <= 7) {
    console.log('\n✅ Ready for migration! Found clients with quotes that need to be migrated.');
  } else if (count > 7) {
    console.log('\n⚠️  Found more than 7 clients with quotes. Please verify this is expected.');
  } else {
    console.log('\n❌ No clients with quotes found to migrate.');
  }

  return {
    tableExists: tableStatus.exists,
    clientsWithQuotes: clientsWithQuotes.clients,
    existingFinancials: existingFinancials.records,
    summary: {
      tableExists: tableStatus.exists,
      clientsCount: clientsWithQuotes.count,
      financialsCount: existingFinancials.count
    }
  };
}

// Export for use in other scripts
export { main as checkFinancialsMigration, findClientsWithQuotes, checkFinancialsTable, checkExistingFinancialData };