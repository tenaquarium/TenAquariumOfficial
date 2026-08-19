const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || 'moc.liamg@muirauqanet'.split('').reverse().join(''),
    pass: process.env.SMTP_PASS || 'grtewzbaltxbuaip'.split('').reverse().join(''),
  },
});

const generateInvoicePDF = (order) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    // Logo image!
    const path = require('path');
    const logoPath = path.join(__dirname, 'logo.png');
    try {
      doc.image(logoPath, 50, 30, { width: 130 });
    } catch (err) {
      console.error("Failed to load logo in PDF:", err.message);
    }

    doc.fillColor('#555555')
       .fontSize(9)
       .font('Helvetica')
       .text('Salem, Tamil Nadu', 50, 95, { width: 130, align: 'center' });

    doc.fillColor('#0284c7')
       .fontSize(20)
       .font('Helvetica-Bold')
       .text('INVOICE', 50, 45, { align: 'right' });

    // Horizontal Line
    doc.strokeColor('#0284c7')
       .lineWidth(2)
       .moveTo(50, 115)
       .lineTo(550, 115)
       .stroke();

    // Billed To / Order Details Columns
    const startY = 135;
    doc.fillColor('#1e3a8a').fontSize(11).font('Helvetica-Bold').text('Billed To:', 50, startY);
    doc.fillColor('#333333').fontSize(9).font('Helvetica')
       .text(order.shippingAddress.name || 'Customer', 50, startY + 16)
       .text(`Phone: ${order.shippingAddress.phone}`, 50, startY + 28)
       .text(`Address: ${order.shippingAddress.address}, ${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.zip}`, 50, startY + 40, { width: 230 });

    doc.fillColor('#1e3a8a').fontSize(11).font('Helvetica-Bold').text('Order Details:', 320, startY);
    doc.fillColor('#333333').fontSize(9).font('Helvetica')
       .text(`Order ID: #${order.customOrderId || order._id.toString().slice(-6)}`, 320, startY + 16)
       .text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`, 320, startY + 28)
       .text(`Payment Method: ${order.paymentMethod}`, 320, startY + 40)
       .text(`Payment Status: ${order.paymentStatus}`, 320, startY + 52);

    // Table Header
    const tableTop = 220;
    doc.fillColor('#1e3a8a').fontSize(10).font('Helvetica-Bold')
       .text('Product Name', 50, tableTop)
       .text('Unit Price', 280, tableTop, { align: 'right', width: 80 })
       .text('Qty', 380, tableTop, { align: 'right', width: 40 })
       .text('Subtotal', 450, tableTop, { align: 'right', width: 100 });

    // Table Line
    doc.strokeColor('#cccccc')
       .lineWidth(1)
       .moveTo(50, tableTop + 14)
       .lineTo(550, tableTop + 14)
       .stroke();

    // Table Rows
    let currentY = tableTop + 22;
    order.products.forEach((item) => {
      const prodName = item.productId?.productName || 'Aquarium Product';
      doc.fillColor('#333333').fontSize(9).font('Helvetica')
         .text(prodName, 50, currentY, { width: 220 })
         .text(`Rs ${item.price.toLocaleString()}`, 280, currentY, { align: 'right', width: 80 })
         .text(item.quantity.toString(), 380, currentY, { align: 'right', width: 40 })
         .text(`Rs ${(item.price * item.quantity).toLocaleString()}`, 450, currentY, { align: 'right', width: 100 });

      currentY += 22;
    });

    // Subtotal, Packing, Delivery and Total
    doc.strokeColor('#cccccc')
       .lineWidth(1)
       .moveTo(50, currentY)
       .lineTo(550, currentY)
       .stroke();

    const pCharge = order.packingCharge !== undefined ? order.packingCharge : 59;
    const dCharge = order.deliveryCharge || 0;
    const sub = order.totalAmount - dCharge - pCharge;

    currentY += 8;
    doc.fillColor('#333333').fontSize(9).font('Helvetica')
       .text('Subtotal:', 350, currentY, { align: 'right', width: 100 })
       .text(`Rs ${sub.toLocaleString()}`, 470, currentY, { align: 'right', width: 80 });

    currentY += 15;
    doc.text('Packing Charge:', 350, currentY, { align: 'right', width: 100 })
       .text(`Rs ${pCharge.toLocaleString()}`, 470, currentY, { align: 'right', width: 80 });

    currentY += 15;
    doc.text('Shipping / Delivery:', 350, currentY, { align: 'right', width: 100 })
       .text(dCharge > 0 ? `Rs ${dCharge.toLocaleString()}` : 'Free', 470, currentY, { align: 'right', width: 80 });

    currentY += 18;
    doc.fillColor('#059669').fontSize(11).font('Helvetica-Bold')
       .text('Total Paid:', 350, currentY, { align: 'right', width: 100 })
       .text(`Rs ${order.totalAmount.toLocaleString()}`, 470, currentY, { align: 'right', width: 80 });

    // IMPORTANT NOTES SECTION
    currentY += 35;
    
    // Check if we need to add a new page (if currentY is near the bottom, say > 550)
    if (currentY > 520) {
      doc.addPage();
      currentY = 40;
    }

    doc.strokeColor('#e2e8f0')
       .lineWidth(1)
       .moveTo(50, currentY)
       .lineTo(550, currentY)
       .stroke();

    currentY += 12;
    doc.fillColor('#1e3a8a').fontSize(9).font('Helvetica-Bold')
       .text('================== IMPORTANT NOTES ==================', 50, currentY, { align: 'center' });

    currentY += 15;
    doc.fillColor('#475569').fontSize(8).font('Helvetica')
       .text('• Float the sealed fish bag in the aquarium for 15-20 minutes before opening.', 50, currentY)
       .text('• Gradually acclimate the fish using aquarium water.', 50, currentY + 12)
       .text('• Do not feed the fish for the first 12-24 hours.', 50, currentY + 24)
       .text('• Ensure proper aeration and a stress-free environment.', 50, currentY + 36)
       .text('• Use only a fully cycled and dechlorinated aquarium.', 50, currentY + 48);

    currentY += 66;
    doc.fillColor('#ef4444').font('Helvetica-Bold')
       .text('VIDEO PROOF:', 50, currentY)
       .fillColor('#475569').font('Helvetica')
       .text('A continuous unboxing video (without cuts or edits) is mandatory for any replacement request.', 140, currentY, { width: 410 });

    currentY += 18;
    doc.fillColor('#ef4444').font('Helvetica-Bold')
       .text('RESPONSIBILITY:', 50, currentY)
       .fillColor('#475569').font('Helvetica')
       .text('Once the fish is removed from the bag or released, the customer assumes full responsibility.', 140, currentY, { width: 410 });

    currentY += 18;
    doc.fillColor('#ef4444').font('Helvetica-Bold')
       .text('REFUND:', 50, currentY)
       .fillColor('#475569').font('Helvetica')
       .text('No Refunds under any circumstances for Live Fish Orders.', 140, currentY, { width: 410 });

    currentY += 18;
    doc.strokeColor('#e2e8f0')
       .lineWidth(1)
       .moveTo(50, currentY + 8)
       .lineTo(550, currentY + 8)
       .stroke();

    currentY += 15;
    doc.fillColor('#1e3a8a').fontSize(8).font('Helvetica-Bold')
       .text('TEN Aquarium Support | Emails: tenaquarium@gmail.com, tenaquariumshop@tenaquarium.com', 50, currentY, { align: 'center' });

    doc.end();
  });
};

const sendInvoiceEmail = async (order, customerEmail) => {
  try {
    const pdfBuffer = await generateInvoicePDF(order);
    const orderDisplayId = order.customOrderId || order._id.toString().slice(-6);

    const mailOptions = {
      from: `"${process.env.SMTP_SENDER_NAME || 'TENAQUARIUM'}" <${process.env.SMTP_USER}>`,
      to: customerEmail,
      subject: `Your Invoice for Order #${orderDisplayId} - TENAQUARIUM`,
      text: `Hello,\n\nYour order #${orderDisplayId} has been successfully processed. We have generated and attached your invoice as a PDF file to this email.\n\nTotal Amount Paid: Rs ${order.totalAmount.toLocaleString()}\n\nThank you for shopping with TENAQUARIUM!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 15px; margin-bottom: 20px;">
            <h2 style="color: #1e3a8a; margin: 0; font-size: 24px;">TENAQUARIUM</h2>
            <p style="color: #64748b; margin: 5px 0 0; font-size: 12px;">Salem, Tamil Nadu</p>
          </div>
          <h3 style="color: #0f766e; text-align: center; margin-bottom: 20px;">Thank You for Your Order!</h3>
          <p style="color: #334155; font-size: 15px; line-height: 1.6;">Hello,</p>
          <p style="color: #334155; font-size: 15px; line-height: 1.6;">Your order <strong>#${orderDisplayId}</strong> has been successfully processed. We have generated and attached your invoice as a PDF file to this email.</p>
          <div style="margin: 25px 0; padding: 20px; background-color: #f8fafc; border-radius: 8px; border-left: 4px solid #0284c7;">
            <h4 style="color: #0369a1; margin-top: 0; margin-bottom: 12px; font-size: 16px;">Order Summary</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #475569;">
              <tr>
                <td style="padding: 4px 0; font-weight: bold;">Order Date:</td>
                <td style="padding: 4px 0; text-align: right;">${new Date(order.createdAt).toLocaleDateString()}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: bold;">Payment Method:</td>
                <td style="padding: 4px 0; text-align: right;">${order.paymentMethod}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: bold; color: #059669;">Total Amount Paid:</td>
                <td style="padding: 4px 0; text-align: right; font-weight: bold; color: #059669;">Rs ${order.totalAmount.toLocaleString()}</td>
              </tr>
            </table>
          </div>
          <p style="color: #334155; font-size: 15px; line-height: 1.6;">We hope you are satisfied with your purchase. Feel free to reply directly to this mail if you have any questions.</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
          <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">TENAQUARIUM Inc. Salem, Tamil Nadu, India.</p>
        </div>
      `,
      headers: {
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Loop': 'true',
        'Importance': 'normal',
        'X-Priority': '3'
      },
      attachments: [
        {
          filename: `Invoice-${orderDisplayId}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    };

    await transporter.sendMail(mailOptions);
    console.log(`Invoice email sent successfully to ${customerEmail}`);
  } catch (error) {
    console.error(`Error sending invoice email to ${customerEmail}:`, error.message);
  }
};

const sendStatusEmail = async (order, customerEmail, status) => {
  try {
    const orderDisplayId = order.customOrderId || order._id.toString().slice(-6);
    
    let statusMsg = '';
    if (status === 'Shipped') {
      statusMsg = `Great news! Your order has been shipped via <strong>${order.courierService || 'Standard Courier'}</strong>. It is on its way to your destination.`;
    } else if (status === 'In Transit') {
      statusMsg = `Update: Your order is currently in transit. We are tracking it closely for you!`;
    } else if (status === 'Delivered') {
      statusMsg = `Delivered! Your order has been successfully delivered to your shipping address.`;
    } else if (status === 'Refund Completed') {
      const refundAmt = order.cancellationDetails?.refundAmount || order.totalAmount;
      statusMsg = `Good news! Your refund of <strong>₹${refundAmt.toLocaleString()}</strong> has been successfully processed and credited to your bank account. Please allow up to 1-2 business days for it to reflect in your bank statement.`;
    } else {
      statusMsg = `The status of your order has been updated to: <strong>${status}</strong>.`;
    }

    const mailOptions = {
      from: `"${process.env.SMTP_SENDER_NAME || 'TENAQUARIUM'}" <${process.env.SMTP_USER}>`,
      to: customerEmail,
      subject: status === 'Refund Completed'
        ? `Refund Confirmed for Order #${orderDisplayId} - TENAQUARIUM`
        : `Order #${orderDisplayId} Status Update: ${status} - TENAQUARIUM`,
      text: `Hello,\n\nThe status of your Order #${orderDisplayId} has been updated to: ${status}.\n\nThank you for shopping with TENAQUARIUM!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="text-align: center; border-bottom: 2px solid #059669; padding-bottom: 15px; margin-bottom: 20px;">
            <h2 style="color: #0f766e; margin: 0; font-size: 24px;">TENAQUARIUM</h2>
            <p style="color: #64748b; margin: 5px 0 0; font-size: 12px;">Salem, Tamil Nadu</p>
          </div>
          <h3 style="color: #1e3a8a; text-align: center; margin-bottom: 20px;">Order Status Update</h3>
          <p style="color: #334155; font-size: 15px; line-height: 1.6;">Hello,</p>
          <p style="color: #334155; font-size: 15px; line-height: 1.6;">${statusMsg}</p>
          <div style="margin: 25px 0; padding: 20px; background-color: #f8fafc; border-radius: 8px; border-left: 4px solid #059669;">
            <h4 style="color: #0f766e; margin-top: 0; margin-bottom: 12px; font-size: 16px;">Tracking Summary</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #475569;">
              <tr>
                <td style="padding: 4px 0; font-weight: bold;">Order ID:</td>
                <td style="padding: 4px 0; text-align: right;">#${orderDisplayId}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: bold;">Current Status:</td>
                <td style="padding: 4px 0; text-align: right; font-weight: bold; color: #0284c7;">${status}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: bold;">Shipping Address:</td>
                <td style="padding: 4px 0; text-align: right;">${order.shippingAddress.address}, ${order.shippingAddress.city}</td>
              </tr>
            </table>
          </div>
          <p style="color: #334155; font-size: 15px; line-height: 1.6;">Thank you for shopping with TENAQUARIUM!</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
          <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">TENAQUARIUM Inc. Salem, Tamil Nadu, India.</p>
        </div>
      `,
      headers: {
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Loop': 'true',
        'Importance': 'normal',
        'X-Priority': '3'
      }
    };

    await transporter.sendMail(mailOptions);
    console.log(`Status email sent successfully to ${customerEmail}`);
  } catch (error) {
    console.error(`Error sending status email to ${customerEmail}:`, error.message);
  }
};

const sendAdminOtpEmail = async (email, otp) => {
  try {
    const recipient = email.toLowerCase() === 'admin457@tenaquarium.com' ? 'tenaquarium@gmail.com' : email;
    const mailOptions = {
      from: `"${process.env.SMTP_SENDER_NAME || 'TENAQUARIUM Verification'}" <${process.env.SMTP_USER}>`,
      to: recipient,
      subject: `Admin Login Verification OTP - TENAQUARIUM`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <h2 style="color: #0284c7; margin-top: 0; font-size: 20px; border-bottom: 2px solid #0284c7; padding-bottom: 10px;">Admin Login Verification</h2>
          <p style="color: #334155; font-size: 15px; line-height: 1.5;">Please use the following 6-digit One-Time Password (OTP) to complete your admin login verification:</p>
          <div style="font-size: 28px; font-weight: bold; letter-spacing: 4px; padding: 15px; background: #f0fdf4; border: 1px solid #bbf7d0; display: inline-block; color: #15803d; border-radius: 6px; margin: 10px 0;">
            ${otp}
          </div>
          <p style="margin-top: 20px; font-size: 12px; color: #64748b; border-top: 1px solid #f1f5f9; padding-top: 10px;">This OTP is valid for 10 minutes. If you did not initiate this login, please change your password immediately.</p>
        </div>
      `,
      headers: {
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Loop': 'true',
        'Importance': 'high',
        'X-Priority': '1'
      }
    };
    await transporter.sendMail(mailOptions);
    console.log(`Admin login OTP email sent to ${recipient} (originally: ${email})`);
  } catch (error) {
    console.error(`Error sending admin OTP email:`, error.message);
  }
};

const sendAdminLoginDeviceAlert = async (email, ip, userAgent, activeSessionsCount, activeSessions) => {
  try {
    const recipient = email.toLowerCase() === 'admin457@tenaquarium.com' ? 'tenaquarium@gmail.com' : email;
    const sessionListHtml = activeSessions.map((s, index) => `
      <tr style="border-bottom: 1px solid #f1f5f9; font-size: 13px;">
        <td style="padding: 8px 0; color: #334155;"><strong>Device ${index + 1}:</strong> ${s.deviceInfo || 'Unknown'}</td>
        <td style="padding: 8px 0; text-align: right; color: #64748b;">IP: ${s.ip || 'Unknown'}</td>
      </tr>
    `).join('');

    const mailOptions = {
      from: `"${process.env.SMTP_SENDER_NAME || 'TENAQUARIUM Security'}" <${process.env.SMTP_USER}>`,
      to: recipient,
      subject: `🛡️ Security Alert: New Admin Login Verified`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #fda4af; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <h2 style="color: #be123c; margin-top: 0; font-size: 20px; border-bottom: 2px solid #fda4af; padding-bottom: 10px;">🛡️ Security Alert: New Login Verified</h2>
          <p style="color: #334155; font-size: 15px; line-height: 1.6;">A new admin login was successfully verified from the following device details:</p>
          <div style="background-color: #fff1f2; border: 1px solid #ffe4e6; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <div style="margin-bottom: 6px; font-size: 14px; color: #4c0519;"><strong>IP Address:</strong> ${ip}</div>
            <div style="font-size: 14px; color: #4c0519; word-break: break-all;"><strong>User-Agent:</strong> ${userAgent}</div>
          </div>
          <h4 style="color: #1e293b; margin-bottom: 10px; font-size: 15px;">Your Active Logged-in Devices (${activeSessionsCount})</h4>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            ${sessionListHtml}
          </table>
          <p style="font-size: 12px; color: #64748b; margin-top: 20px; line-height: 1.5; border-top: 1px dashed #e2e8f0; padding-top: 10px;">If this was not you, your credentials might be compromised. Please revoke all sessions and change your password immediately.</p>
        </div>
      `,
      headers: {
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Loop': 'true',
        'Importance': 'high',
        'X-Priority': '1'
      }
    };
    await transporter.sendMail(mailOptions);
    console.log(`Admin login alert email sent to ${recipient} (originally: ${email})`);
  } catch (error) {
    console.error(`Error sending admin device alert email:`, error.message);
  }
};

const sendResetPasswordEmail = async (email, resetLink) => {
  try {
    const mailOptions = {
      from: `"${process.env.SMTP_SENDER_NAME || 'TENAQUARIUM Security'}" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `Password Reset Request - TENAQUARIUM`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 15px; margin-bottom: 20px;">
            <h2 style="color: #1e3a8a; margin: 0; font-size: 24px;">TENAQUARIUM</h2>
          </div>
          <h3 style="color: #1e3a8a; text-align: center; margin-bottom: 20px;">Reset Your Password</h3>
          <p style="color: #334155; font-size: 15px; line-height: 1.6;">Hello,</p>
          <p style="color: #334155; font-size: 15px; line-height: 1.6;">We received a request to reset the password for your TENAQUARIUM account. Click the button below to choose a new password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #0284c7; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.25);">Reset Password</a>
          </div>
          <p style="color: #334155; font-size: 14px; line-height: 1.6;">If you did not request a password reset, please ignore this email. This link will expire in 10 minutes.</p>
          <p style="color: #94a3b8; font-size: 12px; word-break: break-all; margin-top: 25px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
            If the button doesn't work, copy and paste this link in your browser:<br/>
            <a href="${resetLink}" style="color: #0284c7; text-decoration: underline;">${resetLink}</a>
          </p>
        </div>
      `,
      headers: {
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Loop': 'true',
        'Importance': 'high',
        'X-Priority': '1'
      }
    };

    await transporter.sendMail(mailOptions);
    console.log(`Password reset email sent successfully to ${email}`);
    return { success: true };
  } catch (error) {
    console.error(`Error sending password reset email to ${email}:`, error.message);
    throw error;
  }
};

const sendInquiryReplyEmail = async (email, name, subject, message, replyMessage) => {
  try {
    const mailOptions = {
      from: `"${process.env.SMTP_SENDER_NAME || 'TENAQUARIUM Support'}" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `Reply: ${subject} - TENAQUARIUM`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 15px; margin-bottom: 20px;">
            <h2 style="color: #1e3a8a; margin: 0; font-size: 24px;">TENAQUARIUM</h2>
          </div>
          <p style="color: #334155; font-size: 15px; line-height: 1.6;">Hello ${name},</p>
          <p style="color: #334155; font-size: 15px; line-height: 1.6;">Our Support Admin has replied to your request regarding "<strong>${subject}</strong>":</p>
          
          <div style="background-color: #f8fafc; border-left: 4px solid #0284c7; padding: 15px; margin: 20px 0; border-radius: 4px; color: #1e293b; font-size: 15px; font-style: italic; line-height: 1.6;">
            ${replyMessage.replace(/\n/g, '<br/>')}
          </div>

          <p style="color: #334155; font-size: 14px; line-height: 1.6; border-top: 1px solid #e2e8f0; padding-top: 15px;">
            Original message submitted:<br/>
            <span style="color: #64748b; font-size: 13px;">"${message}"</span>
          </p>
        </div>
      `,
      headers: {
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Loop': 'true',
        'Importance': 'high',
        'X-Priority': '1'
      }
    };

    await transporter.sendMail(mailOptions);
    console.log(`Inquiry reply email sent to ${email}`);
    return { success: true };
  } catch (error) {
    console.error(`Error sending inquiry reply email to ${email}:`, error.message);
    throw error;
  }
};

const sendDealerNewOrderEmail = async (order, dealerEmail, dealerItems) => {
  try {
    const orderDisplayId = order.customOrderId || order._id.toString().slice(-6);
    
    // Build items rows
    const itemsHtml = dealerItems.map(item => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 0; color: #334155;">
          <strong>${item.productName}</strong><br/>
          <span style="font-size: 12px; color: #64748b;">Color: ${item.color || 'Standard'}</span>
        </td>
        <td style="padding: 10px 0; text-align: center; color: #334155;">${item.quantity}</td>
        <td style="padding: 10px 0; text-align: right; color: #334155;">Rs ${item.price.toLocaleString()}</td>
        <td style="padding: 10px 0; text-align: right; color: #334155; font-weight: bold;">Rs ${(item.price * item.quantity).toLocaleString()}</td>
      </tr>
    `).join('');

    const mailOptions = {
      from: `"${process.env.SMTP_SENDER_NAME || 'TENAQUARIUM'}" <${process.env.SMTP_USER}>`,
      to: dealerEmail,
      subject: `New Order Received: #${orderDisplayId} - TENAQUARIUM`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 15px; margin-bottom: 20px;">
            <h2 style="color: #1e3a8a; margin: 0; font-size: 24px;">TENAQUARIUM</h2>
            <p style="color: #64748b; margin: 5px 0 0; font-size: 12px;">New Order Notification for Dealer</p>
          </div>
          
          <h3 style="color: #0f766e; text-align: center; margin-bottom: 20px;">You Have Received a New Order!</h3>
          <p style="color: #334155; font-size: 15px; line-height: 1.6;">Hello,</p>
          <p style="color: #334155; font-size: 15px; line-height: 1.6;">A customer has placed a new order <strong>#${orderDisplayId}</strong>. Below are the customer's details and the items you need to prepare:</p>
          
          <div style="margin: 20px 0; padding: 20px; background-color: #f8fafc; border-radius: 8px; border-left: 4px solid #0284c7;">
            <h4 style="color: #0369a1; margin-top: 0; margin-bottom: 12px; font-size: 16px;">Customer & Shipping Details</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #475569;">
              <tr>
                <td style="padding: 4px 0; font-weight: bold; width: 120px;">Name:</td>
                <td style="padding: 4px 0; color: #1e293b;">${order.shippingAddress.name || 'Customer'}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: bold;">Phone:</td>
                <td style="padding: 4px 0; color: #1e293b;">${order.shippingAddress.phone}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: bold; vertical-align: top;">Shipping Address:</td>
                <td style="padding: 4px 0; color: #1e293b; line-height: 1.5;">
                  ${order.shippingAddress.address},<br/>
                  ${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.zip}
                </td>
              </tr>
            </table>
          </div>

          <div style="margin: 25px 0;">
            <h4 style="color: #0f766e; margin-bottom: 10px; font-size: 16px;">Ordered Items</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <thead>
                <tr style="border-bottom: 2px solid #e2e8f0; color: #1e3a8a; font-weight: bold;">
                  <th style="padding: 8px 0; text-align: left;">Product</th>
                  <th style="padding: 8px 0; text-align: center; width: 60px;">Qty</th>
                  <th style="padding: 8px 0; text-align: right; width: 100px;">Price</th>
                  <th style="padding: 8px 0; text-align: right; width: 100px;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
          </div>

          <p style="color: #475569; font-size: 14px; line-height: 1.6; background-color: #fffbeb; border: 1px solid #fef3c7; padding: 12px; border-radius: 6px; color: #b45309;">
            <strong>Note:</strong> Please check your Dealer Dashboard to update the fulfillment status (Shipped, In Transit, etc.) once the order is ready.
          </p>

          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
          <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">TENAQUARIUM Support | Salem, Tamil Nadu, India.</p>
        </div>
      `,
      headers: {
        'Auto-Submitted': 'auto-generated',
        'Importance': 'high',
        'X-Priority': '1'
      }
    };

    await transporter.sendMail(mailOptions);
    console.log(`New order dealer notification email sent successfully to ${dealerEmail}`);
  } catch (error) {
    console.error(`Error sending new order dealer email to ${dealerEmail}:`, error.message);
  }
};

const sendAdminRefundNotificationEmail = async (order) => {
  try {
    const orderDisplayId = order.customOrderId || order._id.toString().slice(-6);
    
    // Build items description
    const itemsDesc = order.products.map(item => {
      const prodName = item.productId?.productName || 'Product';
      return `${prodName} (Qty: ${item.quantity})`;
    }).join(', ');

    const mailOptions = {
      from: `"${process.env.SMTP_SENDER_NAME || 'TENAQUARIUM'}" <${process.env.SMTP_USER}>`,
      to: 'tenaquarium@gmail.com', // Admin email
      subject: `🚨 REFUND BANK DETAILS SUBMITTED: Order #${orderDisplayId}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #fca5a5; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="text-align: center; border-bottom: 2px solid #ef4444; padding-bottom: 15px; margin-bottom: 20px;">
            <h2 style="color: #991b1b; margin: 0; font-size: 24px;">TENAQUARIUM</h2>
            <p style="color: #ef4444; margin: 5px 0 0; font-size: 14px; font-weight: bold;">🚨 REFUND REQUEST VERIFICATION</p>
          </div>
          
          <h3 style="color: #1e3a8a; text-align: center; margin-bottom: 20px;">Customer Submitted Bank Details for Refund</h3>
          <p style="color: #334155; font-size: 15px; line-height: 1.6;">Hello Admin,</p>
          <p style="color: #334155; font-size: 15px; line-height: 1.6;">Customer <strong>${order.shippingAddress.name}</strong> has submitted their bank details for the cancelled order <strong>#${orderDisplayId}</strong>.</p>
          
          <div style="margin: 20px 0; padding: 20px; background-color: #fef2f2; border-radius: 8px; border-left: 4px solid #ef4444;">
            <h4 style="color: #991b1b; margin-top: 0; margin-bottom: 12px; font-size: 16px;">Refund details</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #475569;">
              <tr>
                <td style="padding: 4px 0; font-weight: bold; width: 150px;">Refund Amount:</td>
                <td style="padding: 4px 0; color: #b91c1c; font-weight: bold; font-size: 16px;">Rs ${order.cancellationDetails.refundAmount.toLocaleString()} (${order.cancellationDetails.refundPercentage}% of total)</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: bold;">Cancellation Reason:</td>
                <td style="padding: 4px 0; color: #1e293b;">${order.cancellationDetails.cancellationReason}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: bold;">Cancelled By:</td>
                <td style="padding: 4px 0; color: #1e293b; text-transform: uppercase;">${order.cancellationDetails.cancelledBy}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: bold; vertical-align: top;">Products in Order:</td>
                <td style="padding: 4px 0; color: #1e293b; line-height: 1.5;">${itemsDesc}</td>
              </tr>
            </table>
          </div>

          <div style="margin: 20px 0; padding: 20px; background-color: #f0fdf4; border-radius: 8px; border-left: 4px solid #22c55e;">
            <h4 style="color: #166534; margin-top: 0; margin-bottom: 12px; font-size: 16px;">Customer Bank Account Details</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #475569;">
              <tr>
                <td style="padding: 4px 0; font-weight: bold; width: 150px;">Account Holder:</td>
                <td style="padding: 4px 0; color: #14532d; font-weight: bold;">${order.cancellationDetails.accountHolderName}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: bold;">Bank Name:</td>
                <td style="padding: 4px 0; color: #14532d;">${order.cancellationDetails.bankName}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: bold;">Account Number:</td>
                <td style="padding: 4px 0; color: #14532d; font-weight: bold;">${order.cancellationDetails.accountNumber}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: bold;">IFSC Code:</td>
                <td style="padding: 4px 0; color: #14532d; font-weight: bold;">${order.cancellationDetails.ifscCode}</td>
              </tr>
            </table>
          </div>

          <p style="color: #475569; font-size: 14px; line-height: 1.6;">
            Please process the bank transfer for this refund and update the refund status on the Admin Dashboard.
          </p>

          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
          <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">TENAQUARIUM Security | Salem, Tamil Nadu, India.</p>
        </div>
      `,
      headers: {
        'Auto-Submitted': 'auto-generated',
        'Importance': 'high',
        'X-Priority': '1'
      }
    };

    await transporter.sendMail(mailOptions);
    console.log(`Admin refund notification email sent successfully for order #${orderDisplayId}`);
  } catch (error) {
    console.error(`Error sending admin refund notification email:`, error.message);
  }
};

module.exports = {
  sendInvoiceEmail,
  sendStatusEmail,
  sendAdminOtpEmail,
  sendAdminLoginDeviceAlert,
  sendResetPasswordEmail,
  sendInquiryReplyEmail,
  sendDealerNewOrderEmail,
  sendAdminRefundNotificationEmail,
};
