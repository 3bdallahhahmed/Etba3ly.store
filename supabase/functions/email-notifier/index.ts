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

    // Status theme colors (light theme)
    const statusColor = currentStatus === 'done' ? '#10B981' : currentStatus === 'printing' ? '#3B82F6' : '#FF8000';
    const statusBg = currentStatus === 'done' ? 'rgba(16, 185, 129, 0.08)' : currentStatus === 'printing' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 128, 0, 0.08)';
    const statusBorder = currentStatus === 'done' ? 'rgba(16, 185, 129, 0.25)' : currentStatus === 'printing' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 128, 0, 0.25)';

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

    const logoDataUri = 'data:image/png;base64,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';

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
    body { margin: 0; padding: 0; width: 100% !important; background-color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1D1D1F; }
    a { color: #FF8000; text-decoration: none; }
    @media only screen and (max-width: 620px) {
      .container-table { width: 100% !important; border-radius: 0 !important; }
      .content-padding { padding-left: 20px !important; padding-right: 20px !important; }
      .stack-column { display: block !important; width: 100% !important; max-width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; }
      .mobile-center { text-align: center !important; }
      .stepper-label { font-size: 10px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #FFFFFF; color: #1D1D1F; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #FFFFFF; padding: 32px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table class="container-table" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; background-color: #F5F5F7; border-radius: 16px; overflow: hidden;">
          
          <!-- Top Accent Bar -->
          <tr>
            <td style="height: 3px; background-color: #FF8000; line-height: 3px; font-size: 3px;">&nbsp;</td>
          </tr>

          <!-- Header: Logo + Invoice Meta -->
          <tr>
            <td class="content-padding" style="padding: 32px 40px 24px; background-color: #FFFFFF;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding-bottom: 20px;">
                    <img src="${logoDataUri}" alt="Etba3ly" width="160" style="display: block; width: 160px; height: auto;" />
                  </td>
                </tr>
                <tr>
                  <td style="height: 1px; background-color: #D2D2D7; line-height: 1px; font-size: 1px;">&nbsp;</td>
                </tr>
                <tr>
                  <td style="padding-top: 16px;">
                    <table width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="left" style="vertical-align: middle;">
                          <div style="display: inline-block; padding: 4px 14px; background: ${statusBg}; border: 1px solid ${statusBorder}; border-radius: 20px; font-size: 11px; font-weight: 600; color: ${statusColor}; text-transform: uppercase; letter-spacing: 0.06em;">
                            ${currentStatus === 'done' ? 'Complete' : currentStatus === 'printing' ? 'Printing' : 'Queued'}
                          </div>
                        </td>
                        <td align="right" style="vertical-align: middle;">
                          <div style="font-size: 13px; color: #86868B;">
                            Invoice <span style="font-weight: 600; color: #1D1D1F;">#${trackCode}</span>
                          </div>
                          <div style="font-size: 12px; color: #86868B; margin-top: 2px;">
                            ${orderDate}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- 3-Step Stepper (Apple style) -->
          <tr>
            <td class="content-padding" style="padding: 24px 40px; background-color: #F5F5F7;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <!-- Step 1: Queued -->
                  <td width="28%" align="center" style="vertical-align: top;">
                    <div style="width: 24px; height: 24px; line-height: 24px; border-radius: 50%; background: ${isStepQueued ? '#FF8000' : '#FFFFFF'}; border: ${isStepQueued ? 'none' : '1.5px solid #D2D2D7'}; color: ${isStepQueued ? '#FFFFFF' : '#D2D2D7'}; font-size: 11px; font-weight: 700; margin: 0 auto 6px; text-align: center;">
                      1
                    </div>
                    <div class="stepper-label" style="font-size: 11px; font-weight: ${isStepQueued ? '700' : '500'}; color: ${isStepQueued ? '#1D1D1F' : '#86868B'};">
                      Queued
                    </div>
                  </td>

                  <!-- Connector 1-2 -->
                  <td width="11%" align="center" style="vertical-align: middle; padding-bottom: 18px;">
                    <div style="height: 1px; background-color: ${isStepPrinting ? '#3B82F6' : '#D2D2D7'};"></div>
                  </td>

                  <!-- Step 2: Printing -->
                  <td width="28%" align="center" style="vertical-align: top;">
                    <div style="width: 24px; height: 24px; line-height: 24px; border-radius: 50%; background: ${isStepPrinting ? '#3B82F6' : '#FFFFFF'}; border: ${isStepPrinting ? 'none' : '1.5px solid #D2D2D7'}; color: ${isStepPrinting ? '#FFFFFF' : '#D2D2D7'}; font-size: 11px; font-weight: 700; margin: 0 auto 6px; text-align: center;">
                      2
                    </div>
                    <div class="stepper-label" style="font-size: 11px; font-weight: ${isStepPrinting ? '700' : '500'}; color: ${isStepPrinting ? '#1D1D1F' : '#86868B'};">
                      Printing
                    </div>
                  </td>

                  <!-- Connector 2-3 -->
                  <td width="11%" align="center" style="vertical-align: middle; padding-bottom: 18px;">
                    <div style="height: 1px; background-color: ${isStepDone ? '#10B981' : '#D2D2D7'};"></div>
                  </td>

                  <!-- Step 3: Ready -->
                  <td width="28%" align="center" style="vertical-align: top;">
                    <div style="width: 24px; height: 24px; line-height: 24px; border-radius: 50%; background: ${isStepDone ? '#10B981' : '#FFFFFF'}; border: ${isStepDone ? 'none' : '1.5px solid #D2D2D7'}; color: ${isStepDone ? '#FFFFFF' : '#D2D2D7'}; font-size: 11px; font-weight: 700; margin: 0 auto 6px; text-align: center;">
                      3
                    </div>
                    <div class="stepper-label" style="font-size: 11px; font-weight: ${isStepDone ? '700' : '500'}; color: ${isStepDone ? '#1D1D1F' : '#86868B'};">
                      Ready
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Status Announcement Card -->
          <tr>
            <td class="content-padding" style="padding: 0 40px 24px; background-color: #FFFFFF;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="padding: 24px 0;">
                <tr>
                  <td>
                    <div style="font-size: 10px; font-weight: 700; color: ${statusColor}; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">
                      ${statusSubtitle}
                    </div>
                    <div style="font-size: 22px; font-weight: 700; color: #1D1D1F; letter-spacing: -0.02em; margin-bottom: 10px; line-height: 1.25;">
                      ${statusTitle}
                    </div>
                    <div style="font-size: 14px; line-height: 1.65; color: #86868B;">
                      ${statusDescription}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hairline Divider -->
          <tr>
            <td class="content-padding" style="padding: 0 40px; background-color: #FFFFFF;">
              <div style="height: 1px; background-color: #D2D2D7;"></div>
            </td>
          </tr>

          <!-- Merged Client + Production Info -->
          <tr>
            <td class="content-padding" style="padding: 24px 40px; background-color: #FFFFFF;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding-bottom: 10px;">
                    <div style="font-size: 13px; color: #86868B; margin-bottom: 2px;">Client</div>
                    <div style="font-size: 15px; font-weight: 600; color: #1D1D1F;">${record.name || 'Valued Client'}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 10px;">
                    <div style="font-size: 13px; color: #86868B; margin-bottom: 2px;">Phone</div>
                    <div style="font-size: 15px; color: #1D1D1F;">${record.phone || 'On file'}</div>
                  </td>
                </tr>
                ${record.email ? `<tr>
                  <td style="padding-bottom: 10px;">
                    <div style="font-size: 13px; color: #86868B; margin-bottom: 2px;">Email</div>
                    <div style="font-size: 15px; color: #1D1D1F;">${record.email}</div>
                  </td>
                </tr>` : ''}
                <tr>
                  <td style="padding-bottom: 10px;">
                    <div style="font-size: 13px; color: #86868B; margin-bottom: 2px;">Material</div>
                    <div style="font-size: 15px; color: #1D1D1F;">${record.material || 'PLA'}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 10px;">
                    <div style="font-size: 13px; color: #86868B; margin-bottom: 2px;">Color</div>
                    <div style="font-size: 15px; color: #1D1D1F;">${record.color || 'Standard'}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 10px;">
                    <div style="font-size: 13px; color: #86868B; margin-bottom: 2px;">Tracking Code</div>
                    <div style="font-size: 15px; font-weight: 600; font-family: 'SF Mono', ui-monospace, Menlo, Monaco, Consolas, monospace; color: #FF8000;">${trackCode}</div>
                  </td>
                </tr>
                <tr>
                  <td>
                    <div style="font-size: 13px; color: #86868B; margin-bottom: 2px;">Collection Hub</div>
                    <div style="font-size: 15px; color: #1D1D1F;">E-JUST Dormitory Hub</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hairline Divider -->
          <tr>
            <td class="content-padding" style="padding: 0 40px; background-color: #FFFFFF;">
              <div style="height: 1px; background-color: #D2D2D7;"></div>
            </td>
          </tr>

          <!-- Invoice Table -->
          <tr>
            <td class="content-padding" style="padding: 24px 40px; background-color: #FFFFFF;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                <thead>
                  <tr style="background-color: #F5F5F7;">
                    <th align="left" style="padding: 10px 12px; font-size: 10px; font-weight: 600; color: #86868B; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #D2D2D7;">Item</th>
                    <th align="center" style="padding: 10px 8px; font-size: 10px; font-weight: 600; color: #86868B; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #D2D2D7;">Weight</th>
                    <th align="center" style="padding: 10px 8px; font-size: 10px; font-weight: 600; color: #86868B; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #D2D2D7;">Rate</th>
                    <th align="right" style="padding: 10px 12px; font-size: 10px; font-weight: 600; color: #86868B; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #D2D2D7;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="padding: 14px 12px; border-bottom: 1px solid #D2D2D7; vertical-align: top;">
                      <div style="font-size: 14px; font-weight: 600; color: #1D1D1F; margin-bottom: 3px;">
                        ${record.ordername || 'Custom 3D Print Part'}
                      </div>
                      <div style="font-size: 12px; color: #86868B; line-height: 1.4;">
                        ${record.material || 'PLA'} - ${record.color || 'Standard'}
                        ${record.notes ? `<br><span style="font-style: italic;">${String(record.notes).slice(0, 80)}</span>` : ''}
                      </div>
                    </td>
                    <td align="center" style="padding: 14px 8px; border-bottom: 1px solid #D2D2D7; font-size: 13px; color: #1D1D1F; vertical-align: top;">
                      ${weightGrams}
                    </td>
                    <td align="center" style="padding: 14px 8px; border-bottom: 1px solid #D2D2D7; font-size: 13px; color: #86868B; vertical-align: top;">
                      ${pricePerGram}
                    </td>
                    <td align="right" style="padding: 14px 12px; border-bottom: 1px solid #D2D2D7; font-size: 14px; font-weight: 600; color: #1D1D1F; vertical-align: top;">
                      ${totalPrice}
                    </td>
                  </tr>

                  <!-- Slicing Fee Row -->
                  <tr>
                    <td colspan="3" align="right" style="padding: 10px 12px 4px; font-size: 13px; color: #86868B;">
                      Slicing Fee
                    </td>
                    <td align="right" style="padding: 10px 12px 4px; font-size: 13px; font-weight: 600; color: #10B981;">
                      Waived
                    </td>
                  </tr>

                  <!-- Total Row -->
                  <tr>
                    <td colspan="3" align="right" style="padding: 12px 12px 4px; font-size: 14px; font-weight: 700; color: #1D1D1F;">
                      Total
                    </td>
                    <td align="right" style="padding: 12px 12px 4px; font-size: 18px; font-weight: 700; color: #FF8000; font-family: 'SF Mono', ui-monospace, Menlo, Monaco, Consolas, monospace;">
                      ${totalPrice}
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>

          ${fileEntries.length > 0 ? `
          <!-- File Links -->
          <tr>
            <td class="content-padding" style="padding: 0 40px 20px; background-color: #FFFFFF;">
              <div style="font-size: 13px; color: #86868B; margin-bottom: 8px;">Attached Files</div>
              ${fileEntries.map(f => `
                <div style="margin-bottom: 4px;">
                  <a href="${f.url}" target="_blank" rel="noreferrer" style="font-size: 13px; color: #FF8000; text-decoration: none;">
                    ${f.label} (${f.platform})
                  </a>
                </div>
              `).join('')}
            </td>
          </tr>
          ` : ''}

          <!-- Hairline Divider -->
          <tr>
            <td class="content-padding" style="padding: 0 40px; background-color: #FFFFFF;">
              <div style="height: 1px; background-color: #D2D2D7;"></div>
            </td>
          </tr>

          <!-- Tracking CTA -->
          <tr>
            <td class="content-padding" style="padding: 32px 40px; background-color: #FFFFFF; text-align: center;">
              <div style="font-size: 10px; font-weight: 600; color: #86868B; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 10px;">
                Your Tracking Code
              </div>
              <div style="font-size: 28px; font-weight: 700; font-family: 'SF Mono', ui-monospace, Menlo, Monaco, Consolas, monospace; color: #FF8000; letter-spacing: 0.12em; margin-bottom: 20px;">
                ${trackCode}
              </div>
              <div>
                <a href="${trackUrl}" target="_blank" rel="noreferrer" style="display: inline-block; background-color: #FF8000; color: #FFFFFF; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-size: 15px; font-weight: 600; letter-spacing: 0.02em; box-shadow: 0 2px 8px rgba(255, 128, 0, 0.25);">
                  Track Order
                </a>
              </div>
              <div style="font-size: 12px; color: #86868B; margin-top: 14px;">
                Use this code or button to check your order status anytime.
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="content-padding" style="background-color: #F5F5F7; padding: 24px 40px; text-align: center;">
              <div style="margin-bottom: 12px;">
                <a href="https://wa.me/201026027552" target="_blank" rel="noreferrer" style="font-size: 12px; color: #FF8000; text-decoration: none;">WhatsApp</a>
                <span style="color: #D2D2D7; margin: 0 8px;">|</span>
                <a href="mailto:support@etba3ly.store" style="font-size: 12px; color: #FF8000; text-decoration: none;">Email Support</a>
              </div>
              <div style="font-size: 12px; color: #86868B; margin-bottom: 4px;">
                Etba3ly 3D Printing | Powered by Centurai Print OS
              </div>
              <div style="font-size: 11px; color: #86868B;">
                Automated notification sent to ${recipient}
              </div>
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
ETBA3LY - 3D PRINTING
========================================

${statusTitle.toUpperCase()}
${statusSubtitle}

Hello ${record.name || 'Customer'},

${statusDescription}

----------------------------------------
ORDER DETAILS
----------------------------------------
Invoice:          #${trackCode}
Date:             ${orderDate}
Status:           ${currentStatus.toUpperCase()}

Client:           ${record.name || 'Valued Client'}
Phone:            ${record.phone || 'On file'}
Material:         ${record.material || 'PLA'}
Color:            ${record.color || 'Standard'}
Tracking Code:    ${trackCode}
Collection Hub:   E-JUST Dormitory Hub

----------------------------------------
INVOICE
----------------------------------------
${record.ordername || 'Custom 3D Print Part'}
Weight: ${weightGrams}  |  Rate: ${pricePerGram}
Slicing Fee: Waived

TOTAL: ${totalPrice}
----------------------------------------

Track your order:
${trackUrl}

Collection & Payment:
Pickup at E-JUST Student Dormitory Hub.
Payment via Vodafone Cash or Cash on Collection.

Need help?
WhatsApp: https://wa.me/201026027552
Email: support@etba3ly.store
Web: ${siteUrl}

Etba3ly 3D Printing | Powered by Centurai Print OS
Automated notification sent to ${recipient}
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