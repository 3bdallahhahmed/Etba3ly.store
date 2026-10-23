import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://gfswtgvsbvmuxywewxij.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ORiX5qWkvIQLrG17DIuvIQ_hgFm971W';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function backfillLegacyOrders() {
  console.log('Starting safe legacy orders backfill...');
  console.log('Connecting to:', SUPABASE_URL);

  // Optional admin login if credentials provided in environment
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    console.log('Signing in with admin credentials...');
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD
    });
    if (authErr) {
      console.warn('Admin sign-in failed, continuing with anon/service key:', authErr.message);
    } else {
      console.log('Admin authenticated successfully.');
    }
  }

  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .order('createdat', { ascending: false });

  if (error) {
    console.error('Error fetching orders:', error.message);
    process.exit(1);
  }

  if (!orders || orders.length === 0) {
    console.log('No orders returned by query.');
    console.log('Note: If Row-Level Security (RLS) is active, pass ADMIN_EMAIL and ADMIN_PASSWORD or SUPABASE_SERVICE_ROLE_KEY to authenticate.');
    return;
  }

  console.log(`Found ${orders.length} total orders to inspect.`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const order of orders) {
    const rawNotes = order.notes || '';
    const tagsToAdd = [];

    // 1. Delivery mode tag
    if (!/\[DELIVERY:/i.test(rawNotes) && !/\[Mode:/i.test(rawNotes)) {
      const deliveryMode = order.delivery_mode ? String(order.delivery_mode).toLowerCase().trim() : 'pickup';
      tagsToAdd.push(`[DELIVERY:${deliveryMode}]`);
    }

    // 2. Deposit and Balance tags
    const totalPrice = Number(order.totalprice) || 0;
    const deposit = (order.deposit_required !== undefined && order.deposit_required !== null && !isNaN(Number(order.deposit_required)))
      ? Number(order.deposit_required)
      : Math.round(totalPrice * 0.5);
    const balance = Math.max(0, totalPrice - deposit);

    if (!/\[DEPOSIT:/i.test(rawNotes) && !/(?:\[Deposit:|\|\s*Deposit:)\s*[\d.]+/i.test(rawNotes)) {
      tagsToAdd.push(`[DEPOSIT:${deposit}]`);
    }

    if (!/\[BALANCE:/i.test(rawNotes) && !/\[Balance:/i.test(rawNotes)) {
      tagsToAdd.push(`[BALANCE:${balance}]`);
    }

    // 3. Print hours tag
    if (!/\[HOURS:/i.test(rawNotes) && !/\[Time:/i.test(rawNotes)) {
      const w = Number(order.weightgrams) || 0;
      const hours = (order.printhours !== undefined && order.printhours !== null && !isNaN(Number(order.printhours)))
        ? Number(order.printhours)
        : (w > 0 ? Number((w / 35).toFixed(1)) : 0.5);
      tagsToAdd.push(`[HOURS:${hours}]`);
    }

    // Skip if already tagged (idempotent)
    if (tagsToAdd.length === 0) {
      skippedCount++;
      continue;
    }

    // Preserve existing notes content and append new tags
    const cleanExisting = rawNotes.trim();
    const enrichedNotes = cleanExisting ? `${cleanExisting} ${tagsToAdd.join(' ')}` : tagsToAdd.join(' ');

    const { error: updateError } = await supabase
      .from('orders')
      .update({ notes: enrichedNotes })
      .eq('id', order.id);

    if (updateError) {
      console.error(`Failed to update order ID ${order.id}:`, updateError.message);
    } else {
      updatedCount++;
      console.log(`Updated order ID ${order.id} with tags: ${tagsToAdd.join(' ')}`);
    }
  }

  console.log('\nBackfill summary:');
  console.log(`- Total orders inspected: ${orders.length}`);
  console.log(`- Updated orders: ${updatedCount}`);
  console.log(`- Skipped (already tagged): ${skippedCount}`);
  console.log('Safe backfill completed successfully.');
}

backfillLegacyOrders().catch(err => {
  console.error('Unexpected backfill error:', err);
  process.exit(1);
});
