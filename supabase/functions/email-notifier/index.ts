import "@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req) => {
  // Check request method
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const payload = await req.json();
    console.log("Received notification payload:", payload);

    // Support both Supabase Webhook payload and direct client invoke
    const table = payload.table || (payload.record ? 'orders' : null);
    if (!payload || (table && table !== 'orders')) {
      return new Response('Invalid table or payload', { status: 400 });
    }

    const type = payload.type || (payload.old_record ? 'UPDATE' : 'INSERT');
    const record = payload.record || payload.order;
    const old_record = payload.old_record;

    if (!record) {
      return new Response('Missing record in payload', { status: 400 });
    }

    // Determine recipient
    const recipient = record.email;
    if (!recipient || typeof recipient !== 'string' || !recipient.includes('@')) {
      console.log('Skipping email: No valid recipient email available for order:', record.id);
      return new Response(JSON.stringify({ message: 'No valid recipient email' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const accentColor = "#FF8000"; // McLaren orange brand accent
    const siteUrl = "https://etba3ly.store";
    const trackUrl = `${siteUrl}/#track`;

    let subject = "";
    let statusTitle = "";
    let statusText = "";
    let isInvoice = false;

    if (type === 'INSERT') {
      // New Order Created -> Send Order Confirmation & Invoice
      isInvoice = true;
      subject = `Order Confirmed - Invoice #${record.tracking_code || record.id} | Etba3ly`;
      statusTitle = "Order Confirmed & Invoice";
      statusText = "Thank you for choosing Etba3ly! We have received your 3D print order and queued it for production. Below is your official order invoice and tracking details.";
    } else if (type === 'UPDATE') {
      const oldStatus = old_record ? old_record.status : null;
      const newStatus = record.status;

      // Avoid duplicate emails if status hasn't changed
      if (oldStatus && oldStatus === newStatus) {
        return new Response('Status did not change', { status: 200 });
      }

      if (newStatus === 'printing') {
        subject = `Update on your order: Printing Started | Etba3ly`;
        statusTitle = "Your Order is Printing";
        statusText = "We have started manufacturing your 3D design. Our team is actively monitoring the print bed for optimal layer adhesion and precision.";
      } else if (newStatus === 'done') {
        isInvoice = true;
        subject = `Your Order is Ready for Pickup! | Etba3ly`;
        statusTitle = "Your Order is Ready";
        statusText = "Great news! Your 3D print is completed, thoroughly inspected, and ready for you to pick up at our campus hub.";
      } else if (newStatus === 'queued') {
        subject = `Update on your order: Queued | Etba3ly`;
        statusTitle = "Your Order is in the Queue";
        statusText = "Your 3D print order is in the preparation queue and will begin printing as soon as a printer becomes available.";
      } else {
        subject = `Update on your order: ${newStatus ? newStatus.toUpperCase() : 'Updated'} | Etba3ly`;
        statusTitle = `Order Status: ${newStatus ? newStatus.toUpperCase() : 'Updated'}`;
        statusText = `The status of your order has been updated to ${newStatus}.`;
      }
    } else {
      return new Response(`Ignore event type: ${type}`, { status: 200 });
    }

    // Get Resend API Key
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not configured');
      return new Response('Server configuration error', { status: 500 });
    }

    // Price and weight calculations
    const weightGrams = record.weightgrams ? `${record.weightgrams} g` : 'To be weighed';
    const pricePerGram = record.pricepergram ? `${record.pricepergram} EGP/g` : '3 EGP/g';
    const totalPrice = record.totalprice !== undefined && record.totalprice !== null 
      ? `${Number(record.totalprice).toFixed(2)} EGP` 
      : 'Calculated upon review';

    // Build HTML Invoice Row
    const invoiceRows = `
      <tr>
        <td style="padding: 10px 0; font-size: 13px; color: #888888; font-weight: 700; text-transform: uppercase; width: 140px; border-bottom: 1px solid #282828;">Project / Item:</td>
        <td style="padding: 10px 0; font-size: 14px; color: #ffffff; font-weight: 600; border-bottom: 1px solid #282828;">${record.ordername || '3D Print Item'}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; font-size: 13px; color: #888888; font-weight: 700; text-transform: uppercase; border-bottom: 1px solid #282828;">Tracking Code:</td>
        <td style="padding: 10px 0; font-size: 15px; color: ${accentColor}; font-family: monospace; font-weight: 800; letter-spacing: 0.05em; border-bottom: 1px solid #282828;">${record.tracking_code || 'N/A'}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; font-size: 13px; color: #888888; font-weight: 700; text-transform: uppercase; border-bottom: 1px solid #282828;">Current Status:</td>
        <td style="padding: 10px 0; font-size: 13px; color: #ffffff; font-weight: 700; text-transform: uppercase; border-bottom: 1px solid #282828;">${record.status || 'QUEUED'}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; font-size: 13px; color: #888888; font-weight: 700; text-transform: uppercase; border-bottom: 1px solid #282828;">Material & Color:</td>
        <td style="padding: 10px 0; font-size: 14px; color: #ffffff; border-bottom: 1px solid #282828;">${record.material || 'Standard PLA'} (${record.color || 'Default'})</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; font-size: 13px; color: #888888; font-weight: 700; text-transform: uppercase; border-bottom: 1px solid #282828;">Estimated Weight:</td>
        <td style="padding: 10px 0; font-size: 14px; color: #ffffff; border-bottom: 1px solid #282828;">${weightGrams} (${pricePerGram})</td>
      </tr>
      <tr>
        <td style="padding: 12px 0 6px 0; font-size: 14px; color: ${accentColor}; font-weight: 800; text-transform: uppercase;">Total Amount:</td>
        <td style="padding: 12px 0 6px 0; font-size: 18px; color: #ffffff; font-weight: 900;">${totalPrice}</td>
      </tr>
    `;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0b0b; color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b0b0b; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width: 600px; width: 100%; background-color: #141414; border: 1px solid #262626; border-radius: 12px; overflow: hidden; border-spacing: 0; box-shadow: 0 12px 40px rgba(0,0,0,0.6);">
          
          <!-- Brand Header -->
          <tr>
            <td style="background-color: #181818; padding: 26px 40px; border-bottom: 1px solid #262626; text-align: center;">
              <span style="font-size: 22px; font-weight: 900; color: #ffffff; letter-spacing: 0.08em; text-transform: uppercase;">
                Etba3ly <span style="color: ${accentColor};">.store</span>
              </span>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 36px 32px;">
              <div style="display: inline-block; padding: 4px 12px; background: rgba(255, 128, 0, 0.12); border: 1px solid rgba(255, 128, 0, 0.3); border-radius: 20px; font-size: 11px; font-weight: 800; color: ${accentColor}; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 14px;">
                ${isInvoice ? 'Official Invoice' : 'Status Notification'}
              </div>

              <h2 style="font-size: 22px; font-weight: 800; color: #ffffff; margin-top: 0; margin-bottom: 12px;">
                ${statusTitle}
              </h2>
              
              <p style="font-size: 15px; line-height: 1.6; color: #cccccc; margin-top: 0; margin-bottom: 20px;">
                Hello ${record.name || 'Valued Customer'},
              </p>
              
              <p style="font-size: 15px; line-height: 1.6; color: #b5b5b5; margin-top: 0; margin-bottom: 26px;">
                ${statusText}
              </p>

              <!-- Order / Invoice Breakdown -->
              <table width="100%" style="background-color: #1b1b1b; border-radius: 8px; border-spacing: 0; padding: 18px 20px; margin-bottom: 28px; border: 1px solid #282828;">
                ${invoiceRows}
              </table>

              <!-- Call to Action -->
              <div style="text-align: center; margin-bottom: 14px;">
                <a href="${trackUrl}" style="display: inline-block; background-color: ${accentColor}; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 14px; font-weight: 800; letter-spacing: 0.03em; box-shadow: 0 4px 14px rgba(255, 128, 0, 0.35);">
                  Track Order Live
                </a>
              </div>

              <p style="font-size: 12px; text-align: center; color: #777777; margin-top: 14px; margin-bottom: 0;">
                Your Tracking Code: <strong style="color: #ffffff; font-family: monospace;">${record.tracking_code || record.id}</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #101010; padding: 24px 30px; text-align: center; border-top: 1px solid #222222;">
              <p style="font-size: 12px; color: #666666; margin: 0 0 6px 0;">
                This is an automated notification from Etba3ly 3D Printing Hub.
              </p>
              <p style="font-size: 11px; color: #555555; margin: 0;">
                Visit us online at <a href="${siteUrl}" style="color: #888888; text-decoration: underline;">etba3ly.store</a>.
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
Etba3ly 3D Printing - ${statusTitle}

Hello ${record.name || 'Customer'},

${statusText}

ORDER DETAILS & INVOICE:
- Tracking Code: ${record.tracking_code || 'N/A'}
- Project / Item: ${record.ordername || '3D Print Item'}
- Status: ${record.status || 'QUEUED'}
- Material: ${record.material || 'Standard PLA'} (${record.color || 'Default'})
- Estimated Weight: ${weightGrams}
- Unit Rate: ${pricePerGram}
- Total Price: ${totalPrice}

You can track your order status live at:
${trackUrl}

This is an automated notification from Etba3ly 3D Printing Hub (etba3ly.store).
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
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('Email sent successfully:', resendData);
    return new Response(JSON.stringify({ success: true, id: resendData.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Error processing notification:', err);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
