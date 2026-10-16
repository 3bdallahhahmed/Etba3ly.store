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
    const weightGrams = record.weightgrams ? `${record.weightgrams} g` : 'Slicing upon review';
    const pricePerGram = record.pricepergram ? `${record.pricepergram} EGP/g` : '3 EGP/g';
    const totalPrice = record.totalprice !== undefined && record.totalprice !== null 
      ? `${Number(record.totalprice).toFixed(2)} EGP` 
      : 'Calculated upon review';

    const orderDate = record.createdat 
      ? new Date(record.createdat).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #07080c; color: #f4f6fb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #07080c; padding: 36px 12px;">
    <tr>
      <td align="center">
        <!-- Main Invoice Container -->
        <table width="100%" style="max-width: 620px; width: 100%; background-color: #0f121b; border: 1px solid #232a3b; border-radius: 16px; overflow: hidden; border-spacing: 0; box-shadow: 0 24px 60px rgba(0,0,0,0.85);">
          
          <!-- Top Accent Banner -->
          <tr>
            <td style="height: 4px; background: linear-gradient(90deg, #FF8000 0%, #FFB347 100%);"></td>
          </tr>

          <!-- Header & Invoice Title -->
          <tr>
            <td style="padding: 32px 32px 24px; border-bottom: 1px solid #1a2030;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left" style="vertical-align: top;">
                    <div style="font-size: 24px; font-weight: 900; color: #ffffff; letter-spacing: 0.04em;">
                      ETBA3LY <span style="color: #FF8000;">.STORE</span>
                    </div>
                    <div style="font-size: 11px; font-weight: 700; color: #8b95a5; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 4px;">
                      Additive Manufacturing & Prototyping
                    </div>
                  </td>
                  <td align="right" style="vertical-align: top;">
                    <div style="display: inline-block; padding: 4px 12px; background: rgba(255, 128, 0, 0.14); border: 1px solid rgba(255, 128, 0, 0.35); border-radius: 6px; font-size: 11px; font-weight: 800; color: #FF8000; text-transform: uppercase; letter-spacing: 0.08em;">
                      ${isInvoice ? 'Official Invoice' : 'Production Notice'}
                    </div>
                    <div style="font-size: 13px; font-family: monospace; font-weight: 700; color: #f4f6fb; margin-top: 8px;">
                      #INV-${record.tracking_code || (record.id ? String(record.id).slice(0, 8) : 'NEW')}
                    </div>
                    <div style="font-size: 12px; color: #8b95a5; margin-top: 2px;">
                      ${orderDate}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Billing Info Header -->
          <tr>
            <td style="padding: 24px 32px; background-color: #131722; border-bottom: 1px solid #1a2030;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="50%" style="vertical-align: top; padding-right: 12px;">
                    <div style="font-size: 11px; font-weight: 800; color: #8b95a5; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px;">
                      Billed To
                    </div>
                    <div style="font-size: 15px; font-weight: 800; color: #ffffff; margin-bottom: 2px;">
                      ${record.name || 'Valued Customer'}
                    </div>
                    <div style="font-size: 13px; color: #a4adba; margin-bottom: 2px;">
                      ${record.phone || 'Phone on file'}
                    </div>
                    ${record.email ? `<div style="font-size: 12px; color: #8b95a5;">${record.email}</div>` : ''}
                  </td>
                  <td width="50%" style="vertical-align: top; padding-left: 12px;">
                    <div style="font-size: 11px; font-weight: 800; color: #8b95a5; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px;">
                      Production Order
                    </div>
                    <div style="font-size: 13px; color: #a4adba; margin-bottom: 4px;">
                      Status: <strong style="color: ${record.status === 'done' ? '#10b981' : record.status === 'printing' ? '#3b82f6' : '#f59e0b'}; text-transform: uppercase;">${record.status || 'QUEUED'}</strong>
                    </div>
                    <div style="font-size: 13px; color: #a4adba;">
                      Tracking Code: <strong style="color: #FF8000; font-family: monospace;">${record.tracking_code || 'N/A'}</strong>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Notification Message -->
          <tr>
            <td style="padding: 24px 32px 16px;">
              <h2 style="font-size: 20px; font-weight: 800; color: #ffffff; margin: 0 0 8px;">
                ${statusTitle}
              </h2>
              <p style="font-size: 14px; line-height: 1.6; color: #a4adba; margin: 0;">
                ${statusText}
              </p>
            </td>
          </tr>

          <!-- Itemized Invoice Table -->
          <tr>
            <td style="padding: 12px 32px 24px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b0d14; border: 1px solid #232a3b; border-radius: 10px; overflow: hidden;">
                <thead>
                  <tr style="background-color: #171b28; border-bottom: 1px solid #232a3b;">
                    <th align="left" style="padding: 12px 16px; font-size: 11px; font-weight: 800; color: #8b95a5; text-transform: uppercase; letter-spacing: 0.06em;">Description / Specs</th>
                    <th align="center" style="padding: 12px 10px; font-size: 11px; font-weight: 800; color: #8b95a5; text-transform: uppercase; letter-spacing: 0.06em;">Est. Weight</th>
                    <th align="center" style="padding: 12px 10px; font-size: 11px; font-weight: 800; color: #8b95a5; text-transform: uppercase; letter-spacing: 0.06em;">Rate</th>
                    <th align="right" style="padding: 12px 16px; font-size: 11px; font-weight: 800; color: #8b95a5; text-transform: uppercase; letter-spacing: 0.06em;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="padding: 16px; border-bottom: 1px solid #1a2030; vertical-align: top;">
                      <div style="font-size: 14px; font-weight: 800; color: #ffffff; margin-bottom: 4px;">
                        ${record.ordername || 'Custom 3D Print Job'}
                      </div>
                      <div style="font-size: 12px; color: #8b95a5; line-height: 1.4;">
                        Material: <strong style="color: #f4f6fb;">${record.material || 'Standard PLA'}</strong> &bull; Color: <strong style="color: #f4f6fb;">${record.color || 'Standard'}</strong>
                      </div>
                    </td>
                    <td align="center" style="padding: 16px 10px; border-bottom: 1px solid #1a2030; font-size: 13px; font-weight: 700; color: #ffffff; vertical-align: top;">
                      ${weightGrams}
                    </td>
                    <td align="center" style="padding: 16px 10px; border-bottom: 1px solid #1a2030; font-size: 13px; color: #a4adba; vertical-align: top;">
                      ${pricePerGram}
                    </td>
                    <td align="right" style="padding: 16px; border-bottom: 1px solid #1a2030; font-size: 14px; font-weight: 800; color: #ffffff; vertical-align: top;">
                      ${totalPrice}
                    </td>
                  </tr>

                  <!-- Calculation Breakdown -->
                  <tr>
                    <td colspan="3" align="right" style="padding: 12px 16px 4px; font-size: 12px; color: #8b95a5;">
                      Subtotal:
                    </td>
                    <td align="right" style="padding: 12px 16px 4px; font-size: 13px; font-weight: 700; color: #f4f6fb;">
                      ${totalPrice}
                    </td>
                  </tr>
                  <tr>
                    <td colspan="3" align="right" style="padding: 4px 16px; font-size: 12px; color: #8b95a5;">
                      Setup & Calibration Fee:
                    </td>
                    <td align="right" style="padding: 4px 16px; font-size: 13px; font-weight: 700; color: #10b981;">
                      0.00 EGP (Waived)
                    </td>
                  </tr>
                  <tr>
                    <td colspan="3" align="right" style="padding: 12px 16px; font-size: 14px; font-weight: 900; color: #FF8000; text-transform: uppercase;">
                      Total Payable (EGP):
                    </td>
                    <td align="right" style="padding: 12px 16px; font-size: 20px; font-weight: 900; color: #FF8000; font-family: monospace;">
                      ${totalPrice}
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Tracking Action Card -->
          <tr>
            <td style="padding: 0 32px 28px;">
              <div style="background-color: #131722; border: 1px dashed #2d374d; border-radius: 12px; padding: 20px; text-align: center;">
                <div style="font-size: 11px; font-weight: 800; color: #8b95a5; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">
                  Your Production Tracking Code
                </div>
                <div style="font-size: 22px; font-weight: 900; font-family: monospace; color: #FF8000; letter-spacing: 0.12em; margin-bottom: 14px;">
                  ${record.tracking_code || record.id}
                </div>
                <div>
                  <a href="${trackUrl}" style="display: inline-block; background: linear-gradient(135deg, #FF8000 0%, #FFB347 100%); color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 13.5px; font-weight: 800; letter-spacing: 0.03em; box-shadow: 0 6px 20px rgba(255, 128, 0, 0.35);">
                    Track Order Live Status
                  </a>
                </div>
              </div>
            </td>
          </tr>

          <!-- Terms & Pick-up Instructions -->
          <tr>
            <td style="padding: 0 32px 28px;">
              <div style="font-size: 11.5px; line-height: 1.6; color: #6e798d;">
                <strong>Payment & Pickup:</strong> Cash on collection or Vodafone Cash transfer upon pickup. All manufactured parts are inspected for dimensional accuracy and layer adhesion prior to packaging.
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0b0d14; padding: 20px 32px; text-align: center; border-top: 1px solid #1a2030;">
              <p style="font-size: 12px; color: #6e798d; margin: 0 0 4px 0;">
                Etba3ly 3D Printing & Prototyping Hub &bull; Powered by Centauri Print OS
              </p>
              <p style="font-size: 11px; color: #4e5768; margin: 0;">
                Need assistance? Reply directly to this email or visit <a href="${siteUrl}" style="color: #FF8000; text-decoration: none;">etba3ly.store</a>.
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
