// Migration script to transfer financial data from clients table to financials table
import { createClient } from '@supabase/supabase-js';

interface Client {
  id: string;
  client_name: string;
  quoted: string | null;
  initial_payment: string | null;
  due_date_balance: string | null;
  created_at: string;
}

interface FinancialTransaction {
  client_id: string;
  client_name: string;
  case_number: string;
  transaction_type: 'quote' | 'payment' | 'adjustment';
  amount: number;
  payment_method?: string;
  transaction_date: string;
  payment_due_date?: string;
  service_description?: string;
  notes?: string;
}

async function migrateClientFinancials() {
  console.log('🚀 Starting financial data migration from clients to financials table...\n');

  try {
    // Validate environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.log('❌ Missing Supabase environment variables');
      console.log('Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
      return { success: false, error: 'Missing Supabase credentials' };
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Step 1: Find all clients with quotes
    console.log('🔍 Finding clients with quotes...');
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, client_name, quoted, initial_payment, due_date_balance, created_at')
      .not('quoted', 'is', null)
      .not('quoted', 'eq', '');

    if (clientsError) {
      console.log('❌ Error querying clients:', clientsError.message);
      return { success: false, error: clientsError.message };
    }

    if (!clients || clients.length === 0) {
      console.log('❌ No clients with quotes found to migrate');
      return { success: false, error: 'No clients with quotes found' };
    }

    console.log(`✅ Found ${clients.length} clients with quotes`);

    if (clients.length > 7) {
      console.log('⚠️  Found more than 7 clients with quotes. Please verify this is expected.');
    }

    // Step 2: Check if financials table exists
    console.log('\n🔍 Checking financials table...');
    const { error: tableCheckError } = await supabase
      .from('financials')
      .select('id')
      .limit(1);

    if (tableCheckError) {
      console.log('❌ Financials table does not exist:', tableCheckError.message);
      console.log('Please run the setup-financials.sql script first');
      return { success: false, error: 'Financials table does not exist' };
    }

    console.log('✅ Financials table exists');

    // Step 3: Check for existing financial records for these clients
    console.log('\n🔍 Checking for existing financial records...');
    const clientNames = clients.map(c => c.client_name);
    const { data: existingRecords, error: existingError } = await supabase
      .from('financials')
      .select('client_name, transaction_type')
      .in('client_name', clientNames);

    if (existingError) {
      console.log('❌ Error checking existing records:', existingError.message);
      return { success: false, error: existingError.message };
    }

    const existingCount = existingRecords?.length || 0;
    console.log(`📊 Found ${existingCount} existing financial records for these clients`);

    // Step 4: Prepare migration data
    console.log('\n📋 Preparing migration data...');
    const transactionsToInsert: FinancialTransaction[] = [];

    clients.forEach((client: Client, index: number) => {
      console.log(`${index + 1}. Processing ${client.client_name}...`);

      // Generate a case number based on client name and intake date
      const intakeDate = new Date(client.created_at);
      const caseNumber = `CASE-${intakeDate.getFullYear()}${(intakeDate.getMonth() + 1).toString().padStart(2, '0')}-${client.client_name.replace(/\s+/g, '').substring(0, 3).toUpperCase()}`;

      // Add quote transaction
      if (client.quoted && parseFloat(client.quoted) > 0) {
        transactionsToInsert.push({
          client_id: client.id,
          client_name: client.client_name,
          case_number: caseNumber,
          transaction_type: 'quote',
          amount: parseFloat(client.quoted),
          transaction_date: intakeDate.toISOString().split('T')[0], // YYYY-MM-DD format
          payment_due_date: client.due_date_balance || undefined,
          service_description: `Legal services for ${client.client_name}`,
          notes: 'Migrated from clients table'
        });
        console.log(`   - Quote: $${client.quoted}`);
      }

      // Add payment transaction if initial payment exists
      if (client.initial_payment && parseFloat(client.initial_payment) > 0) {
        transactionsToInsert.push({
          client_id: client.id,
          client_name: client.client_name,
          case_number: caseNumber,
          transaction_type: 'payment',
          amount: parseFloat(client.initial_payment),
          payment_method: 'Initial Payment', // Default payment method
          transaction_date: intakeDate.toISOString().split('T')[0],
          service_description: 'Initial payment for legal services',
          notes: 'Migrated from clients table'
        });
        console.log(`   - Payment: $${client.initial_payment}`);
      }
    });

    console.log(`\n📊 Prepared ${transactionsToInsert.length} transactions for insertion`);

    // Step 5: Insert the transactions
    if (transactionsToInsert.length > 0) {
      console.log('\n💾 Inserting financial transactions...');

      const { data: insertedData, error: insertError } = await supabase
        .from('financials')
        .insert(transactionsToInsert)
        .select();

      if (insertError) {
        console.log('❌ Error inserting financial records:', insertError.message);
        return { success: false, error: insertError.message };
      }

      console.log(`✅ Successfully inserted ${insertedData?.length || 0} financial records`);

      // Step 6: Verify the migration
      console.log('\n🔍 Verifying migration...');
      const { data: verifyData, error: verifyError } = await supabase
        .from('financials')
        .select('*')
        .in('client_name', clientNames)
        .order('created_at', { ascending: false });

      if (verifyError) {
        console.log('❌ Error verifying migration:', verifyError.message);
      } else {
        console.log(`✅ Verification: Found ${verifyData?.length || 0} total financial records for migrated clients`);

        // Group by transaction type
        const quotes = verifyData?.filter(r => r.transaction_type === 'quote') || [];
        const payments = verifyData?.filter(r => r.transaction_type === 'payment') || [];

        console.log(`   - Quotes: ${quotes.length}`);
        console.log(`   - Payments: ${payments.length}`);
      }

    } else {
      console.log('\n⚠️  No transactions to insert');
    }

    // Step 7: Summary
    console.log('\n📊 MIGRATION SUMMARY:');
    console.log(`Clients processed: ${clients.length}`);
    console.log(`Transactions created: ${transactionsToInsert.length}`);
    console.log(`Existing records before: ${existingCount}`);

    if (transactionsToInsert.length > 0) {
      console.log('✅ Migration completed successfully!');
      console.log('\n💡 Next steps:');
      console.log('1. Review the migrated data in your financials table');
      console.log('2. Update the clients table financial fields if needed');
      console.log('3. Consider backing up your data before making further changes');
    }

    return {
      success: true,
      clientsProcessed: clients.length,
      transactionsCreated: transactionsToInsert.length,
      existingRecordsBefore: existingCount
    };

  } catch (error) {
    console.log('❌ Migration failed:', error);
    return { success: false, error: String(error) };
  }
}

// Export for use in other scripts
export { migrateClientFinancials };

// Run the migration if this script is executed directly
if (require.main === module) {
  migrateClientFinancials()
    .then((result) => {
      console.log('\n🏁 Migration script completed');
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error('💥 Unexpected error:', error);
      process.exit(1);
    });
}