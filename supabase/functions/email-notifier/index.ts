import "@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Check request method
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("Received notification payload:", payload);

    const type = payload.type || (payload.old_record ? 'UPDATE' : 'INSERT');
    const whatsappApiKey = payload.whatsapp_api_key || Deno.env.get('CALLMEBOT_API_KEY');
    const rawAdminPhone = payload.whatsapp_number || payload.admin_phone || Deno.env.get('CALLMEBOT_PHONE');
    const telegramBotToken = payload.telegram_bot_token || Deno.env.get('TELEGRAM_BOT_TOKEN');
    const telegramChatId = payload.telegram_chat_id || Deno.env.get('TELEGRAM_CHAT_ID');
    const discordWebhookUrl = payload.discord_webhook_url || Deno.env.get('DISCORD_WEBHOOK_URL');

    // Handle dedicated Telegram connectivity test
    if (type === 'TEST_TELEGRAM') {
      if (!telegramBotToken || !telegramChatId) {
        return new Response(JSON.stringify({ 
          error: 'Missing Telegram bot token or chat ID.' 
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const tgRes = await fetch(`https://api.telegram.org/bot${String(telegramBotToken).trim()}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: String(telegramChatId).trim(),
          text: `[Centurai Print OS] Cloud Telegram bot connection verified! Orders will appear here in real time.`
        })
      });
      const tgData = await tgRes.json();
      return new Response(JSON.stringify(tgData), { 
        status: tgRes.ok ? 200 : 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Handle dedicated Discord connectivity test
    if (type === 'TEST_DISCORD') {
      if (!discordWebhookUrl) {
        return new Response(JSON.stringify({ 
          error: 'Missing Discord webhook URL.' 
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const dcRes = await fetch(String(discordWebhookUrl).trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `[Centurai Print OS] Cloud Discord webhook connection verified! Orders will appear here in real time.`
        })
      });
      return new Response(JSON.stringify({ success: dcRes.ok }), { 
        status: dcRes.ok ? 200 : 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Handle dedicated WhatsApp connectivity test
    if (type === 'TEST_WHATSAPP') {
      if (!whatsappApiKey || !rawAdminPhone) {
        return new Response(JSON.stringify({ 
          error: 'Missing CallMeBot API key or WhatsApp phone number.' 
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const cleanPhone = String(rawAdminPhone).replace(/\D/g, "");
      const intlPhone = cleanPhone.startsWith("0") ? "2" + cleanPhone : cleanPhone;
      const testMsg = `[Centurai Workshop Test] Automated WhatsApp alert connection verified! Your workshop alerts are connected directly via the cloud backend.`;
      const botUrl = `https://api.callmebot.com/whatsapp.php?phone=${intlPhone}&text=${encodeURIComponent(testMsg)}&apikey=${encodeURIComponent(String(whatsappApiKey).trim())}`;
      const botRes = await fetch(botUrl);
      const botText = await botRes.text();
      return new Response(JSON.stringify({ 
        success: botRes.ok, 
        status: botRes.status,
        body: botText.slice(0, 200) 
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const record = payload.record || payload.order || (type === 'TEST' ? {
      name: payload.name || "Workshop Diagnostic",
      email: payload.email || payload.recipient,
      ordername: "Centurai Calibration Cube (20mm)",
      material: "PLA",
      color: "McLaren Orange",
      weightgrams: 45,
      pricepergram: 3,
      totalprice: 135,
      tracking_code: "JP-TEST99",
      fileurl: "https://www.printables.com/model/12345",
      status: "queued"
    } : null);
    const old_record = payload.old_record;
    const adminEmail = payload.admin_email;

    if (!record) {
      return new Response(JSON.stringify({ error: 'Missing order record in payload' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Automated backend WhatsApp alert via CallMeBot on new orders (100% cloud delivery, ad-blocker immune)
    if (type === 'INSERT' && whatsappApiKey && rawAdminPhone) {
      try {
        const cleanPhone = String(rawAdminPhone).replace(/\D/g, "");
        const intlPhone = cleanPhone.startsWith("0") ? "2" + cleanPhone : cleanPhone;
        const alertMsg = `[Centurai Workshop Alert] New Order Received!\n` +
          `Tracking: ${record.tracking_code || 'N/A'}\n` +
          `Client: ${record.name || 'Customer'}\n` +
          `Phone: ${record.phone || 'N/A'}\n` +
          `Part: ${record.ordername || 'Untitled Part'}\n` +
          `Material: ${record.material || 'PLA'} (${record.color || 'Standard'})\n` +
          `Weight: ${record.weightgrams ? `${record.weightgrams}g` : 'Reviewing'}\n` +
          `Total: ${record.totalprice !== undefined && record.totalprice !== null ? `${Number(record.totalprice).toFixed(2)} EGP` : 'Pending'}\n` +
          (record.fileurl ? `Model / Files: ${record.fileurl}\n` : '');

        const botUrl = `https://api.callmebot.com/whatsapp.php?phone=${intlPhone}&text=${encodeURIComponent(alertMsg)}&apikey=${encodeURIComponent(String(whatsappApiKey).trim())}`;
        console.log(`Dispatching cloud CallMeBot WhatsApp alert to ${intlPhone}...`);
        const botRes = await fetch(botUrl);
        const botText = await botRes.text();
        console.log(`CallMeBot server response status: ${botRes.status}, body: ${botText.slice(0, 100)}`);
      } catch (waErr) {
        console.warn("Could not dispatch server-side CallMeBot WhatsApp notification:", waErr);
      }
    }

    // Automated backend Telegram push alert on new orders
    if (type === 'INSERT' && telegramBotToken && telegramChatId) {
      try {
        const tgText = `[NEW 3D PRINT ORDER]\n\n` +
          `Tracking: ${record.tracking_code || record.id || 'N/A'}\n` +
          `Client: ${record.name || 'Customer'}\n` +
          `Phone: ${record.phone || 'N/A'}\n` +
          `Part: ${record.ordername || 'Untitled Part'}\n` +
          `Material: ${record.material || 'PLA'} (${record.color || 'Standard'})\n` +
          `Weight: ${record.weightgrams ? `${record.weightgrams}g` : 'Reviewing'}\n` +
          `Total: ${record.totalprice !== undefined && record.totalprice !== null ? `${Number(record.totalprice).toFixed(2)} EGP` : 'Pending'}\n` +
          (record.fileurl ? `Model / File Link:\n${record.fileurl}\n\n` : '\n') +
          `Live Tracking:\nhttps://etba3ly.store/#track?id=${encodeURIComponent(record.tracking_code || record.id || '')}`;

        console.log("Dispatching cloud Telegram alert...");
        await fetch(`https://api.telegram.org/bot${String(telegramBotToken).trim()}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: String(telegramChatId).trim(),
            text: tgText
          })
        });
      } catch (tgErr) {
        console.warn("Could not dispatch server-side Telegram alert:", tgErr);
      }
    }

    // Automated backend Discord webhook alert on new orders
    if (type === 'INSERT' && discordWebhookUrl) {
      try {
        console.log("Dispatching cloud Discord webhook alert...");
        const fields = [
          { name: "Customer", value: `${record.name || 'Customer'} (${record.phone || 'N/A'})`, inline: true },
          { name: "Material", value: `${record.material || 'PLA'} - ${record.color || 'Standard'}`, inline: true },
          { name: "Estimated Weight", value: `${record.weightgrams ? `${record.weightgrams}g` : 'Reviewing'}`, inline: true },
          { name: "Total Price", value: `${record.totalprice !== undefined && record.totalprice !== null ? `${Number(record.totalprice).toFixed(2)} EGP` : 'Pending'}`, inline: true },
          { name: "Tracking Code", value: `${record.tracking_code || record.id || 'N/A'}`, inline: true },
          { name: "Track Order", value: `[Open Tracking](https://etba3ly.store/#track?id=${encodeURIComponent(record.tracking_code || record.id || '')})`, inline: true }
        ];
        if (record.fileurl) {
          fields.push({ name: "Model / File Link", value: String(record.fileurl).slice(0, 1000), inline: false });
        }

        await fetch(String(discordWebhookUrl).trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `[NEW 3D PRINT ORDER] Tracking #${record.tracking_code || record.id}`,
            embeds: [{
              title: `Order: ${record.ordername || "Custom 3D Print"}`,
              color: 0xFF8000,
              fields,
              footer: { text: "Centurai Print OS • Etba3ly" },
              timestamp: new Date().toISOString()
            }]
          })
        });
      } catch (dcErr) {
        console.warn("Could not dispatch server-side Discord alert:", dcErr);
      }
    }

    // Determine recipient for email
    const recipient = record.email || payload.email;
    if (!recipient || typeof recipient !== 'string' || !recipient.includes('@')) {
      console.log('Skipping email: No valid recipient email available for order:', record.id);
      return new Response(JSON.stringify({ message: 'WhatsApp notification dispatched; skipped email (no valid recipient)' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const siteUrl = "https://etba3ly.store";
    const trackCode = record.tracking_code || (record.id ? String(record.id) : "N/A");
    const trackUrl = `${siteUrl}/#track?id=${encodeURIComponent(trackCode)}`;

    let subject = "";
    let statusTitle = "";
    let statusSubtitle = "";
    let statusDescription = "";
    let isInvoice = false;
    const currentStatus = (record.status || "queued").toLowerCase().trim();

    if (type === 'TEST') {
      isInvoice = true;
      subject = `[Diagnostic Test] Official Order Invoice #${trackCode} | Etba3ly`;
      statusTitle = "System Diagnostic Verified";
      statusSubtitle = "Resend API & Edge Function Integration Active";
      statusDescription = "This automated test verifies that your Resend transactional email pipeline and Supabase Edge Functions are running at peak performance. Customer order confirmation emails and official PDF-ready invoices will mirror this exact format.";
    } else if (type === 'INSERT') {
      isInvoice = true;
      subject = `Order Confirmed - Invoice #${trackCode} | Etba3ly 3D Printing`;
      statusTitle = "Order Received & Queued";
      statusSubtitle = "Your 3D design has entered the production queue";
      statusDescription = "Thank you for manufacturing with Etba3ly! We have logged your order, verified the design specifications, and queued it for slicing and production. Your official invoice and live tracking details are provided below.";
    } else if (type === 'UPDATE') {
      const oldStatus = old_record ? old_record.status : null;
      const newStatus = record.status;

      // Avoid duplicate emails if status hasn't changed
      if (oldStatus && oldStatus === newStatus) {
        return new Response(JSON.stringify({ message: 'Status did not change' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (newStatus === 'printing') {
        subject = `Manufacturing Active: Order #${trackCode} is Printing | Etba3ly`;
        statusTitle = "Production In Progress";
        statusSubtitle = "Centurai CC1 3D Printer is manufacturing your part";
        statusDescription = "Your design is currently on the build plate! Our operators have calibrated bed leveling, extrusion flow, and layer bonding to guarantee maximum structural integrity and precision finish.";
      } else if (newStatus === 'done') {
        isInvoice = true;
        subject = `Order Complete: Ready for Pickup! #${trackCode} | Etba3ly`;
        statusTitle = "Completed & Inspected";
        statusSubtitle = "Your print is ready for collection at the campus hub";
        statusDescription = "Great news! Your 3D print has completed manufacturing, passed post-print dimensional quality control, and is packaged for pickup. Please bring your tracking code or order invoice upon collection.";
      } else if (newStatus === 'queued') {
        subject = `Status Update: Order #${trackCode} Queued | Etba3ly`;
        statusTitle = "Order in Queue";
        statusSubtitle = "Scheduled for next available build slot";
        statusDescription = "Your order is prepared in our scheduling buffer and will start printing as soon as the designated machine completes its current job.";
      } else {
        const prettyStatus = (newStatus || 'Updated').toUpperCase();
        subject = `Order Status Update: ${prettyStatus} #${trackCode} | Etba3ly`;
        statusTitle = `Order Status: ${prettyStatus}`;
        statusSubtitle = `Latest progress on job #${trackCode}`;
        statusDescription = `The manufacturing status for your order has been updated to ${newStatus}.`;
      }
    } else {
      return new Response(JSON.stringify({ message: `Ignored event type: ${type}` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get Resend API Key
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not configured');
      return new Response(JSON.stringify({ 
        error: 'RESEND_API_KEY secret is not configured in Supabase. Please add your Resend API Key in Supabase Project Settings -> Edge Functions -> Secrets.' 
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Price and weight calculations
    const weightNum = parseFloat(record.weightgrams) || 0;
    const weightGrams = weightNum > 0 ? `${weightNum.toFixed(1)} g` : 'Slicing upon review';
    const rateNum = parseFloat(record.pricepergram) || 3;
    const pricePerGram = `${rateNum.toFixed(2)} EGP/g`;
    const totalNum = record.totalprice !== undefined && record.totalprice !== null && !isNaN(Number(record.totalprice))
      ? Number(record.totalprice)
      : (weightNum > 0 ? (weightNum * rateNum) : null);
    const totalPrice = totalNum !== null ? `${totalNum.toFixed(2)} EGP` : 'Calculated upon review';

    const orderDate = record.createdat 
      ? new Date(record.createdat).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    // Step state helper
    const isStepQueued = true;
    const isStepPrinting = currentStatus === 'printing' || currentStatus === 'done';
    const isStepDone = currentStatus === 'done';

    // Status theme colors
    const statusColor = currentStatus === 'done' ? '#10B981' : currentStatus === 'printing' ? '#3B82F6' : '#FF8000';
    const statusBg = currentStatus === 'done' ? 'rgba(16, 185, 129, 0.12)' : currentStatus === 'printing' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 128, 0, 0.12)';
    const statusBorder = currentStatus === 'done' ? 'rgba(16, 185, 129, 0.35)' : currentStatus === 'printing' ? 'rgba(59, 130, 246, 0.35)' : 'rgba(255, 128, 0, 0.35)';

    // Model files or link extraction
    const rawFiles = record.fileurl ? String(record.fileurl).split(',').map(s => s.trim()).filter(Boolean) : [];
    const fileEntries = rawFiles.map((url, i) => {
      const isStorage = url.includes('/storage/v1/object/public/stl-files/') || url.match(/\.(stl|zip|rar)($|\?)/i);
      let label = isStorage ? `Download 3D CAD File ${rawFiles.length > 1 ? `#${i + 1}` : ''}` : `Open External Model Link ${rawFiles.length > 1 ? `#${i + 1}` : ''}`;
      let platform = 'CAD File';
      if (!isStorage) {
        if (url.includes('printables.com')) platform = 'Printables';
        else if (url.includes('thingiverse.com')) platform = 'Thingiverse';
        else if (url.includes('makerworld.com')) platform = 'MakerWorld';
        else if (url.includes('drive.google.com')) platform = 'Google Drive';
        else if (url.includes('dropbox.com')) platform = 'Dropbox';
        else if (url.includes('onedrive.live.com') || url.includes('1drv.ms')) platform = 'OneDrive';
        else platform = 'Web Reference';
      }
      return { url, isStorage, label, platform };
    });

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${subject}</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; background-color: #07080d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', Helvetica, Arial, sans-serif; color: #f4f6fb; }
    @media only screen and (max-width: 620px) {
      .container-table { width: 100% !important; border-radius: 0 !important; }
      .content-padding { padding-left: 20px !important; padding-right: 20px !important; }
      .stack-column { display: block !important; width: 100% !important; max-width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; }
      .mobile-center { text-align: center !important; }
      .stepper-label { font-size: 10px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #07080d; color: #f4f6fb; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #07080d; padding: 32px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table class="container-table" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 620px; width: 100%; background-color: #0e121b; border: 1px solid #1e2536; border-radius: 16px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.85);">
          
          <!-- Top Accent Gradient Line -->
          <tr>
            <td style="height: 4px; background: linear-gradient(90deg, #FF8000 0%, #FFA834 50%, #FF8000 100%); line-height: 4px; font-size: 4px;">&nbsp;</td>
          </tr>

          <!-- Header Section -->
          <tr>
            <td class="content-padding" style="padding: 32px 32px 24px; border-bottom: 1px solid #192030; background-color: #0e121b;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left" style="vertical-align: top;">
                    <div style="font-size: 24px; font-weight: 900; color: #ffffff; letter-spacing: 0.05em; line-height: 1.1;">
                      ETBA3LY<span style="color: #FF8000;">.STORE</span>
                    </div>
                    <div style="font-size: 10.5px; font-weight: 700; color: #838e9f; text-transform: uppercase; letter-spacing: 0.12em; margin-top: 5px;">
                      Additive Manufacturing &bull; Centurai Print OS
                    </div>
                  </td>
                  <td align="right" style="vertical-align: top;">
                    <div style="display: inline-block; padding: 5px 12px; background: ${statusBg}; border: 1px solid ${statusBorder}; border-radius: 20px; font-size: 10.5px; font-weight: 800; color: ${statusColor}; text-transform: uppercase; letter-spacing: 0.08em;">
                      ${isInvoice ? 'Official Invoice' : 'Production Update'}
                    </div>
                    <div style="font-size: 13.5px; font-family: ui-monospace, Menlo, Monaco, Consolas, monospace; font-weight: 700; color: #ffffff; margin-top: 8px;">
                      #INV-${trackCode}
                    </div>
                    <div style="font-size: 11.5px; color: #838e9f; margin-top: 2px;">
                      ${orderDate}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Visual 3-Step Production Stepper -->
          <tr>
            <td class="content-padding" style="padding: 24px 32px; background-color: #0a0d14; border-bottom: 1px solid #192030;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <!-- Step 1: Queued -->
                  <td width="30%" align="center" style="vertical-align: top;">
                    <div style="width: 28px; height: 28px; line-height: 28px; border-radius: 50%; background: ${isStepQueued ? '#FF8000' : '#192030'}; color: #ffffff; font-size: 12px; font-weight: 800; margin: 0 auto 6px; box-shadow: ${isStepQueued ? '0 0 12px rgba(255,128,0,0.5)' : 'none'};">
                      1
                    </div>
                    <div class="stepper-label" style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: ${isStepQueued ? '#ffffff' : '#626e82'};">
                      Queued
                    </div>
                    <div style="font-size: 9.5px; color: #838e9f; margin-top: 2px;">
                      Geometry Verified
                    </div>
                  </td>

                  <!-- Connector 1-2 -->
                  <td width="5%" align="center" style="vertical-align: middle; padding-bottom: 22px;">
                    <div style="height: 2px; background-color: ${isStepPrinting ? '#3B82F6' : '#1e2536'};"></div>
                  </td>

                  <!-- Step 2: Printing -->
                  <td width="30%" align="center" style="vertical-align: top;">
                    <div style="width: 28px; height: 28px; line-height: 28px; border-radius: 50%; background: ${isStepPrinting ? '#3B82F6' : '#151b27'}; border: 1px solid ${isStepPrinting ? '#60a5fa' : '#222c3d'}; color: ${isStepPrinting ? '#ffffff' : '#626e82'}; font-size: 12px; font-weight: 800; margin: 0 auto 6px; box-shadow: ${isStepPrinting ? '0 0 12px rgba(59,130,246,0.5)' : 'none'};">
                      2
                    </div>
                    <div class="stepper-label" style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: ${isStepPrinting ? '#60a5fa' : '#626e82'};">
                      Printing
                    </div>
                    <div style="font-size: 9.5px; color: #838e9f; margin-top: 2px;">
                      Active on Bed
                    </div>
                  </td>

                  <!-- Connector 2-3 -->
                  <td width="5%" align="center" style="vertical-align: middle; padding-bottom: 22px;">
                    <div style="height: 2px; background-color: ${isStepDone ? '#10B981' : '#1e2536'};"></div>
                  </td>

                  <!-- Step 3: Ready -->
                  <td width="30%" align="center" style="vertical-align: top;">
                    <div style="width: 28px; height: 28px; line-height: 28px; border-radius: 50%; background: ${isStepDone ? '#10B981' : '#151b27'}; border: 1px solid ${isStepDone ? '#34d399' : '#222c3d'}; color: ${isStepDone ? '#ffffff' : '#626e82'}; font-size: 12px; font-weight: 800; margin: 0 auto 6px; box-shadow: ${isStepDone ? '0 0 12px rgba(16,185,129,0.5)' : 'none'};">
                      3
                    </div>
                    <div class="stepper-label" style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: ${isStepDone ? '#34d399' : '#626e82'};">
                      Ready
                    </div>
                    <div style="font-size: 9.5px; color: #838e9f; margin-top: 2px;">
                      Campus Collection
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Status Announcement Card -->
          <tr>
            <td class="content-padding" style="padding: 28px 32px 20px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: ${statusBg}; border: 1px solid ${statusBorder}; border-radius: 12px; padding: 20px;">
                <tr>
                  <td>
                    <div style="font-size: 11px; font-weight: 800; color: ${statusColor}; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">
                      ${statusSubtitle}
                    </div>
                    <div style="font-size: 20px; font-weight: 900; color: #ffffff; letter-spacing: -0.01em; margin-bottom: 8px;">
                      ${statusTitle}
                    </div>
                    <div style="font-size: 13.5px; line-height: 1.6; color: #b7c1d1;">
                      ${statusDescription}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Metadata Grid: Billed To & Production Specs -->
          <tr>
            <td class="content-padding" style="padding: 10px 32px 24px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #121723; border: 1px solid #1f2739; border-radius: 12px;">
                <tr>
                  <td class="stack-column" width="50%" style="padding: 20px 24px; vertical-align: top; border-right: 1px solid #1f2739;">
                    <div style="font-size: 10px; font-weight: 800; color: #838e9f; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">
                      Client Information
                    </div>
                    <div style="font-size: 15px; font-weight: 800; color: #ffffff; margin-bottom: 4px;">
                      ${record.name || 'Valued Client'}
                    </div>
                    <div style="font-size: 13px; color: #9eaab9; margin-bottom: 3px;">
                      Phone: <strong style="color: #f4f6fb;">${record.phone || 'On file'}</strong>
                    </div>
                    ${record.email ? `<div style="font-size: 12px; color: #838e9f;">${record.email}</div>` : ''}
                  </td>
                  <td class="stack-column" width="50%" style="padding: 20px 24px; vertical-align: top;">
                    <div style="font-size: 10px; font-weight: 800; color: #838e9f; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">
                      Production Specs
                    </div>
                    <div style="font-size: 13px; color: #9eaab9; margin-bottom: 4px;">
                      Material: <strong style="color: #ffffff;">${record.material || 'PLA'}</strong> &bull; Color: <strong style="color: #ffffff;">${record.color || 'Standard'}</strong>
                    </div>
                    <div style="font-size: 13px; color: #9eaab9; margin-bottom: 4px;">
                      Tracking: <strong style="color: #FF8000; font-family: ui-monospace, monospace;">${trackCode}</strong>
                    </div>
                    <div style="font-size: 12px; color: #838e9f;">
                      Campus Hub: <strong style="color: #d1d8e2;">E-JUST Dormitory Hub</strong>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Itemized Invoice Breakdown -->
          <tr>
            <td class="content-padding" style="padding: 0 32px 24px;">
              <div style="font-size: 12px; font-weight: 800; color: #838e9f; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px;">
                Manufacturing & Cost Breakdown
              </div>
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0a0d14; border: 1px solid #1f2739; border-radius: 12px; overflow: hidden;">
                <thead>
                  <tr style="background-color: #151b27; border-bottom: 1px solid #1f2739;">
                    <th align="left" style="padding: 12px 18px; font-size: 10.5px; font-weight: 800; color: #838e9f; text-transform: uppercase; letter-spacing: 0.06em;">Specification</th>
                    <th align="center" style="padding: 12px 10px; font-size: 10.5px; font-weight: 800; color: #838e9f; text-transform: uppercase; letter-spacing: 0.06em;">Est. Weight</th>
                    <th align="center" style="padding: 12px 10px; font-size: 10.5px; font-weight: 800; color: #838e9f; text-transform: uppercase; letter-spacing: 0.06em;">Rate</th>
                    <th align="right" style="padding: 12px 18px; font-size: 10.5px; font-weight: 800; color: #838e9f; text-transform: uppercase; letter-spacing: 0.06em;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="padding: 18px; border-bottom: 1px solid #161c29; vertical-align: top;">
                      <div style="font-size: 14.5px; font-weight: 800; color: #ffffff; margin-bottom: 4px;">
                        ${record.ordername || 'Custom 3D Print Part'}
                      </div>
                      <div style="font-size: 12px; color: #838e9f; line-height: 1.4;">
                        Filament: <span style="color: #d1d8e2;">${record.material || 'PLA'}</span> (${record.color || 'Standard'})
                        ${record.notes ? `<br><span style="font-style: italic; color: #6e798d;">Instructions: ${String(record.notes).slice(0, 80)}</span>` : ''}
                      </div>
                    </td>
                    <td align="center" style="padding: 18px 10px; border-bottom: 1px solid #161c29; font-size: 13.5px; font-weight: 700; color: #ffffff; vertical-align: top;">
                      ${weightGrams}
                    </td>
                    <td align="center" style="padding: 18px 10px; border-bottom: 1px solid #161c29; font-size: 13px; color: #9eaab9; vertical-align: top;">
                      ${pricePerGram}
                    </td>
                    <td align="right" style="padding: 18px; border-bottom: 1px solid #161c29; font-size: 14.5px; font-weight: 800; color: #ffffff; vertical-align: top;">
                      ${totalPrice}
                    </td>
                  </tr>

                  <!-- Slicing / Calibration Fee Row -->
                  <tr>
                    <td colspan="3" align="right" style="padding: 12px 18px 4px; font-size: 12px; color: #838e9f;">
                      Slicing & Machine Calibration Fee:
                    </td>
                    <td align="right" style="padding: 12px 18px 4px; font-size: 12.5px; font-weight: 700; color: #10B981;">
                      0.00 EGP (Waived)
                    </td>
                  </tr>

                  <!-- Total Amount Payable Row -->
                  <tr style="background-color: #121723;">
                    <td colspan="3" align="right" style="padding: 16px 18px; font-size: 13px; font-weight: 900; color: #FF8000; text-transform: uppercase; letter-spacing: 0.05em;">
                      Total Payable (EGP):
                    </td>
                    <td align="right" style="padding: 16px 18px; font-size: 20px; font-weight: 900; color: #FF8000; font-family: ui-monospace, monospace;">
                      ${totalPrice}
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>

          ${fileEntries.length > 0 ? `
          <!-- Attached 3D CAD or Model Reference Links -->
          <tr>
            <td class="content-padding" style="padding: 0 32px 24px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #121723; border: 1px solid #1f2739; border-radius: 12px; padding: 16px 20px;">
                <tr>
                  <td>
                    <div style="font-size: 10.5px; font-weight: 800; color: #838e9f; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">
                      Attached 3D Geometry & Reference Files
                    </div>
                    ${fileEntries.map(f => `
                      <div style="margin-bottom: 6px;">
                        <a href="${f.url}" target="_blank" rel="noreferrer" style="display: inline-block; padding: 6px 14px; background: rgba(255, 128, 0, 0.1); border: 1px solid rgba(255, 128, 0, 0.3); border-radius: 6px; font-size: 12px; font-weight: 700; color: #FF8000; text-decoration: none;">
                          ${f.label} (${f.platform}) &rarr;
                        </a>
                      </div>
                    `).join('')}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ` : ''}

          <!-- Live Tracking Code Action Card -->
          <tr>
            <td class="content-padding" style="padding: 0 32px 28px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: linear-gradient(180deg, #121723 0%, #0b0e16 100%); border: 1px dashed #2b354a; border-radius: 14px; padding: 24px; text-align: center;">
                <tr>
                  <td align="center">
                    <div style="font-size: 11px; font-weight: 800; color: #838e9f; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">
                      Your Live Production Tracking Code
                    </div>
                    <div style="font-size: 26px; font-weight: 900; font-family: ui-monospace, Menlo, Monaco, Consolas, monospace; color: #FF8000; letter-spacing: 0.16em; margin-bottom: 16px;">
                      ${trackCode}
                    </div>
                    <div>
                      <a href="${trackUrl}" target="_blank" rel="noreferrer" style="display: inline-block; background: linear-gradient(135deg, #FF8000 0%, #FF9E2C 100%); color: #ffffff; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-size: 14px; font-weight: 800; letter-spacing: 0.04em; box-shadow: 0 8px 24px rgba(255, 128, 0, 0.35);">
                        Track Order Live Status &rarr;
                      </a>
                    </div>
                    <div style="font-size: 11.5px; color: #626e82; margin-top: 12px;">
                      Bookmark your tracking link to check nozzle temperature, remaining time, and pickup notice.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Collection & Payment Instructions -->
          <tr>
            <td class="content-padding" style="padding: 0 32px 24px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b0e16; border-left: 3px solid #FF8000; padding: 14px 18px; border-radius: 0 8px 8px 0;">
                <tr>
                  <td>
                    <div style="font-size: 12.5px; font-weight: 800; color: #ffffff; margin-bottom: 3px;">
                      Pickup Hub & Payment Policy
                    </div>
                    <div style="font-size: 12px; line-height: 1.5; color: #838e9f;">
                      Collection is available directly at the E-JUST Student Dormitory Hub. Payment is accepted via <strong>Vodafone Cash</strong> or <strong>Cash on Collection</strong> upon part inspection.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Need Assistance Support Bar -->
          <tr>
            <td class="content-padding" style="padding: 0 32px 28px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <div style="font-size: 11px; font-weight: 800; color: #838e9f; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px;">
                      Direct Workshop Communication
                    </div>
                    <table border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding: 0 6px;">
                          <a href="https://wa.me/201026027552" target="_blank" rel="noreferrer" style="display: inline-block; padding: 8px 18px; background: rgba(37, 211, 102, 0.12); border: 1px solid rgba(37, 211, 102, 0.3); border-radius: 6px; font-size: 12px; font-weight: 700; color: #25D366; text-decoration: none;">
                            WhatsApp Support
                          </a>
                        </td>
                        <td style="padding: 0 6px;">
                          <a href="mailto:support@etba3ly.store" style="display: inline-block; padding: 8px 18px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 6px; font-size: 12px; font-weight: 700; color: #d1d8e2; text-decoration: none;">
                            Email Workshop
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="content-padding" style="background-color: #07090f; padding: 22px 32px; text-align: center; border-top: 1px solid #161c29;">
              <p style="font-size: 12px; font-weight: 700; color: #838e9f; margin: 0 0 4px 0;">
                Etba3ly 3D Printing & Prototyping Hub &bull; Powered by Centurai Print OS
              </p>
              <p style="font-size: 11px; color: #505a6b; margin: 0;">
                Automated notification sent to ${recipient}. Please retain this invoice for order collection verification.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

    // Plain text alternative for anti-spam deliverability
    const textContent = `
===================================================================
ETBA3LY.STORE | CENTURAI PRINT OS
Additive Manufacturing & Prototyping Hub
===================================================================

${statusTitle.toUpperCase()}
${statusSubtitle}

Hello ${record.name || 'Customer'},

${statusDescription}

-------------------------------------------------------------------
ORDER SPECIFICATIONS & INVOICE
-------------------------------------------------------------------
Invoice / Tracking Code: ${trackCode}
Date: ${orderDate}
Client Name: ${record.name || 'Valued Client'}
Client Phone: ${record.phone || 'On file'}
Project Part: ${record.ordername || '3D Print Part'}
Manufacturing Status: ${currentStatus.toUpperCase()}
Material: ${record.material || 'PLA'} (${record.color || 'Standard'})
Estimated Weight: ${weightGrams}
Unit Rate: ${pricePerGram}
Calibration / Slicing Fee: 0.00 EGP (Waived)
-------------------------------------------------------------------
TOTAL AMOUNT PAYABLE: ${totalPrice}
-------------------------------------------------------------------

LIVE PRODUCTION TRACKING:
${trackUrl}

COLLECTION & PAYMENT POLICY:
Orders are collected at the E-JUST Student Dormitory Hub.
Payment is accepted via Vodafone Cash or Cash on Collection upon inspection.

Need assistance?
WhatsApp: https://wa.me/201026027552
Email: support@etba3ly.store
Website: ${siteUrl}

===================================================================
Centurai Print OS • Powered by Elegoo Centauri Carbon CC1
===================================================================
`.trim();

    // Send email using Resend API
    const senderEmail = Deno.env.get('SENDER_EMAIL') || 'Etba3ly <orders@etba3ly.store>';
    const replyToEmail = Deno.env.get('REPLY_TO_EMAIL') || 'support@etba3ly.store';

    console.log(`Sending email via Resend to ${recipient}...`);
    let resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: senderEmail,
        reply_to: replyToEmail,
        to: [recipient],
        subject: subject,
        html: htmlContent,
        text: textContent
      })
    });

    let resendData = await resendResponse.json();

    // If custom domain is pending SES propagation (403), gracefully fallback to onboarding@resend.dev
    if (!resendResponse.ok && resendData?.message && resendData.message.includes('not verified')) {
      console.warn('Domain not yet fully active on Resend, attempting temporary fallback to onboarding@resend.dev...');
      resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`
        },
        body: JSON.stringify({
          from: 'Etba3ly <onboarding@resend.dev>',
          reply_to: replyToEmail,
          to: [recipient],
          subject: subject,
          html: htmlContent,
          text: textContent
        })
      });
      resendData = await resendResponse.json();
    }

    if (!resendResponse.ok) {
      console.error('Resend API returned error:', resendData);
      return new Response(JSON.stringify({ error: resendData }), { 
        status: resendResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Send admin notification copy for new orders
    if (type === 'INSERT' && adminEmail && typeof adminEmail === 'string' && adminEmail.includes('@') && adminEmail !== recipient) {
      try {
        console.log(`Sending new order alert copy to admin: ${adminEmail}`);
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendApiKey}`
          },
          body: JSON.stringify({
            from: senderEmail,
            reply_to: recipient,
            to: [adminEmail],
            subject: `[NEW ORDER ALERT] Invoice #${trackCode} from ${record.name || 'Customer'}`,
            html: htmlContent,
            text: textContent
          })
        });
      } catch (adminErr) {
        console.warn('Could not dispatch admin copy:', adminErr);
      }
    }

    console.log('Email sent successfully:', resendData);
    return new Response(JSON.stringify({ success: true, id: resendData.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Error processing notification:', err);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});