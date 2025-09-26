// Test script for the financial management system
// Run with: node tests/test-financials.js

const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config();

async function testFinancialSystem() {
  console.log('🧪 Testing Financial Management System...\n');

  // Initialize Supabase client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase environment variables');
    console.log('Please check your .env file has NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Test 1: Check if financials table exists
    console.log('📋 Test 1: Checking financials table structure...');
    const { data: tableInfo, error: tableError } = await supabase
      .from('financials')
      .select('*')
      .limit(1);

    if (tableError) {
      console.error('❌ Financials table not found or not accessible:', tableError.message);
      console.log('Please run the SQL setup script first in your Supabase SQL Editor');
      return;
    }

    console.log('✅ Financials table exists and is accessible');

    // Test 2: Get all financial records
    console.log('\n📊 Test 2: Getting all financial records...');
    const { data: allRecords, error: recordsError } = await supabase
      .from('financials')
      .select('*')
      .order('created_at', { ascending: false });

    if (recordsError) {
      console.error('❌ Error fetching records:', recordsError.message);
    } else {
      console.log(`✅ Found ${allRecords?.length || 0} financial records`);

      if (allRecords && allRecords.length > 0) {
        console.log('\n📋 Sample records:');
        allRecords.slice(0, 5).forEach((record, index) => {
          console.log(`   ${index + 1}. ${record.client_name || 'Unknown Client'} - ${record.transaction_type} - $${record.amount} (${record.transaction_date})`);
        });
      }
    }

    // Test 3: Test balance calculation function (if available)
    console.log('\n💰 Test 3: Testing balance calculation...');
    try {
      const { data: balanceData, error: balanceError } = await supabase
        .rpc('search_financials_by_client', {
          search_query: 'John Smith',
          max_results: 5
        });

      if (balanceError) {
        console.log('⚠️ Balance function not available, trying manual calculation...');

        // Manual balance calculation
        const { data: manualBalance, error: manualError } = await supabase
          .from('financials')
          .select('transaction_type, amount')
          .eq('client_name', 'John Smith');

        if (!manualError && manualBalance) {
          let totalQuoted = 0;
          let totalPaid = 0;

          manualBalance.forEach(transaction => {
            if (transaction.transaction_type === 'quote') {
              totalQuoted += Number(transaction.amount);
            } else {
              totalPaid += Number(transaction.amount);
            }
          });

          console.log(`✅ John Smith: Quoted: $${totalQuoted.toFixed(2)}, Paid: $${totalPaid.toFixed(2)}, Balance: $${(totalQuoted - totalPaid).toFixed(2)}`);
        }
      } else if (balanceData && balanceData.length > 0) {
        const johnBalance = balanceData.find(b => b.client_name === 'John Smith');
        if (johnBalance) {
          console.log(`✅ John Smith: Quoted: $${Number(johnBalance.total_quoted).toFixed(2)}, Paid: $${Number(johnBalance.total_paid).toFixed(2)}, Balance: $${Number(johnBalance.balance).toFixed(2)}`);
        }
      }
    } catch (funcError) {
      console.log('⚠️ Database functions not available yet');
    }

    // Test 4: Test different client scenarios
    console.log('\n📈 Test 4: Testing different client scenarios...');

    const testClients = ['John Smith', 'Sarah Johnson', 'Michael Brown', 'Emily Davis', 'Robert Wilson'];

    for (const clientName of testClients) {
      try {
        const { data: clientRecords, error: clientError } = await supabase
          .from('financials')
          .select('transaction_type, amount')
          .eq('client_name', clientName);

        if (!clientError && clientRecords && clientRecords.length > 0) {
          let totalQuoted = 0;
          let totalPaid = 0;

          clientRecords.forEach(transaction => {
            if (transaction.transaction_type === 'quote') {
              totalQuoted += Number(transaction.amount);
            } else {
              totalPaid += Number(transaction.amount);
            }
          });

          const balance = totalQuoted - totalPaid;
          const status = balance > 0 ? 'Outstanding' : balance < 0 ? 'Credit' : 'Paid';
          console.log(`   ${clientName}: $${totalQuoted.toFixed(2)} quoted, $${totalPaid.toFixed(2)} paid, $${balance.toFixed(2)} ${status}`);
        }
      } catch (err) {
        // Client might not exist, skip
      }
    }

    // Test 5: Summary statistics
    console.log('\n📊 Test 5: Overall financial summary...');
    const { data: summaryData, error: summaryError } = await supabase
      .from('financials')
      .select('transaction_type, amount');

    if (!summaryError && summaryData) {
      let totalQuotes = 0;
      let totalPayments = 0;
      let totalAdjustments = 0;

      summaryData.forEach(transaction => {
        const amount = Number(transaction.amount);
        switch (transaction.transaction_type) {
          case 'quote':
            totalQuotes += amount;
            break;
          case 'payment':
            totalPayments += amount;
            break;
          case 'adjustment':
            totalAdjustments += amount;
            break;
        }
      });

      console.log(`   💰 Total Quoted: $${totalQuotes.toFixed(2)}`);
      console.log(`   💳 Total Payments: $${totalPayments.toFixed(2)}`);
      console.log(`   ⚖️ Total Adjustments: $${totalAdjustments.toFixed(2)}`);
      console.log(`   📈 Net Revenue: $${(totalPayments + totalAdjustments - totalQuotes).toFixed(2)}`);
      console.log(`   📋 Total Transactions: ${summaryData.length}`);
    }

    console.log('\n✨ Financial system test completed!');
    console.log('\n💡 You can now test the AI tools with queries like:');
    console.log('   - "How much does John Smith owe me?"');
    console.log('   - "Show me all outstanding balances"');
    console.log('   - "Add a payment of $200 for John Smith"');
    console.log('   - "Show payment history for Sarah Johnson"');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testFinancialSystem();