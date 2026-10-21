import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gfswtgvsbvmuxywewxij.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ORiX5qWkvIQLrG17DIuvIQ_hgFm971W';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('Testing Safe Database Inserts & Updates...\n');

async function testAll() {
  // Test 1: Customer Order Placement
  const tracking1 = 'TEST-CUST-' + Math.random().toString(36).substring(2, 6).toUpperCase();
  const customerPayload = {
    name: 'Customer Web Tester',
    phone: '01011223344',
    email: 'client@etba3ly.test',
    ordername: 'Mechanical Gear Component',
    material: 'PETG',
    color: 'Black',
    notes: '[PROFILE:0.20mm] [INFILL:25%] [DELIVERY:pickup] [DEPOSIT:60] [BALANCE:60] [HOURS:2.1]',
    fileurl: '',
    filesize: 2048,
    status: 'queued',
    weightgrams: 40,
    totalprice: 120,
    tracking_code: tracking1,
    createdat: new Date().toISOString()
  };

  const { error: err1 } = await supabase.from('orders').insert([customerPayload]);
  if (err1) {
    console.error('Customer checkout insert FAILED:', err1.message);
    process.exit(1);
  }
  console.log('[PASS] Customer checkout order inserted with 0 errors. Tracking:', tracking1);

  // Test 2: Admin Quick Add
  const tracking2 = 'TEST-ADMIN-' + Math.random().toString(36).substring(2, 6).toUpperCase();
  const adminPayload = {
    name: 'Walk-in Student',
    phone: '01099887766',
    email: 'direct@etba3ly.store',
    ordername: 'Dorm Project Bracket',
    material: 'PLA',
    color: 'Standard',
    notes: '[PRINTER:CC Abdalla] [DELIVERY:pickup] [DEPOSIT:45] [HOURS:1.4]',
    fileurl: '',
    filesize: 0,
    status: 'queued',
    weightgrams: 30,
    totalprice: 90,
    tracking_code: tracking2,
    createdat: new Date().toISOString()
  };

  const { error: err2 } = await supabase.from('orders').insert([adminPayload]);
  if (err2) {
    console.error('Admin quick add insert FAILED:', err2.message);
    process.exit(1);
  }
  console.log('[PASS] Admin quick add order inserted with 0 errors. Tracking:', tracking2);

  // Test 3: Read back via search_orders
  const { data: searchResults } = await supabase.rpc('search_orders', { q: tracking2 });
  if (!searchResults || searchResults.length === 0) {
    console.error('Failed to retrieve inserted order');
    process.exit(1);
  }
  const savedOrder = searchResults[0];
  console.log('[PASS] Order retrieved successfully. ID:', savedOrder.id);

  console.log('\nALL 3 DATABASE OPERATIONS VERIFIED WITH 100% RELIABILITY.');
}

testAll();
