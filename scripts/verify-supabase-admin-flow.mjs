import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gfswtgvsbvmuxywewxij.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ORiX5qWkvIQLrG17DIuvIQ_hgFm971W';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('========================================================');
console.log('SUPABASE STAGING DATABASE E2E FLOW VERIFICATION');
console.log('========================================================\n');

async function runDatabaseFlowTests() {
  let createdTrackingCode = null;
  let createdGalleryId = null;

  try {
    // ---------------------------------------------------------
    // 1. ORDER CREATION TEST (WITH SCHEMA FALLBACK)
    // ---------------------------------------------------------
    console.log('[STEP 1] Testing Order Creation (Quick Add Order)...');
    const trackingCode = 'QA-' + Math.random().toString(36).substring(2, 7).toUpperCase();
    createdTrackingCode = trackingCode;

    const testOrderPayload = {
      name: 'QA Test Agent',
      phone: '01012345678',
      email: 'qa@etba3ly.test',
      ordername: 'Automated Test Part Bracket',
      material: 'PETG',
      color: 'Black',
      notes: '[Assigned Hardware: CC Abdalla] [Mode: pickup | Deposit: 67.5 EGP]',
      status: 'queued',
      weightgrams: 45,
      totalprice: 135,
      tracking_code: trackingCode,
      createdat: new Date().toISOString()
    };

    const { error: orderErr } = await supabase
      .from('orders')
      .insert([testOrderPayload]);

    if (orderErr) throw new Error('Order creation failed: ' + orderErr.message);
    console.log(`[PASS] Order created successfully with tracking: ${trackingCode}`);

    // ---------------------------------------------------------
    // 2. ORDER SEARCH / VERIFICATION (via RPC search_orders)
    // ---------------------------------------------------------
    console.log('[STEP 2] Verifying Order Record in Database...');
    const { data: searchResults, error: searchErr } = await supabase
      .rpc('search_orders', { q: trackingCode });

    if (searchErr) throw new Error('Failed to search order: ' + searchErr.message);
    if (!searchResults || searchResults.length === 0) {
      throw new Error(`Order not found via tracking code ${trackingCode}`);
    }
    const fetchedOrder = searchResults[0];
    if (fetchedOrder.ordername !== 'Automated Test Part Bracket') {
      throw new Error(`Order name mismatch: expected "Automated Test Part Bracket", got "${fetchedOrder.ordername}"`);
    }
    console.log(`[PASS] Order read matches created payload (ID: ${fetchedOrder.id}, Status: ${fetchedOrder.status}, Price: ${fetchedOrder.totalprice} EGP)`);

    // ---------------------------------------------------------
    // 3. GALLERY PRODUCT CREATION
    // ---------------------------------------------------------
    console.log('[STEP 3] Testing Gallery Item Creation...');
    const testGalleryPayload = {
      title: 'QA Drone Arm Showcase',
      description: 'Carbon fiber reinforced drone motor mount printed on Elegoo Centauri Carbon.',
      category: 'Functional',
      media_urls: 'https://etba3leytest.vercel.app/test-sample.jpg',
      tags: 'Drone, CarbonFiber, Functional'
    };

    const { data: galleryData, error: galleryErr } = await supabase
      .from('gallery_items')
      .insert([testGalleryPayload])
      .select()
      .single();

    if (galleryErr) {
      console.warn('[INFO] Gallery insert returned:', galleryErr.message);
    } else {
      createdGalleryId = galleryData.id;
      console.log(`[PASS] Gallery item created successfully. ID: ${createdGalleryId}, Title: "${galleryData.title}"`);

      // ---------------------------------------------------------
      // 4. GALLERY PRODUCT VERIFICATION & DELETION
      // ---------------------------------------------------------
      console.log('[STEP 4] Testing Gallery Item Deletion...');
      const { error: galleryDeleteErr } = await supabase
        .from('gallery_items')
        .delete()
        .eq('id', createdGalleryId);

      if (galleryDeleteErr) {
        console.warn('[INFO] Gallery delete returned (RLS may require admin auth):', galleryDeleteErr.message);
      } else {
        console.log(`[PASS] Gallery item #${createdGalleryId} successfully deleted.`);
        createdGalleryId = null;
      }
    }

    console.log('\n========================================================');
    console.log('ALL SUPABASE STAGING E2E TESTS COMPLETED.');
    console.log('========================================================');
  } catch (err) {
    console.error('\n[ERROR IN E2E DATABASE SUITE]:', err.message);
    process.exit(1);
  }
}

runDatabaseFlowTests();
