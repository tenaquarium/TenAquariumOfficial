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
    const logoPath = "d:/anti_project/frontend/public/logo.png";
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

    // Subtotal, Delivery and Total
    doc.strokeColor('#cccccc')
       .lineWidth(1)
       .moveTo(50, currentY)
       .lineTo(550, currentY)
       .stroke();

    currentY += 8;
    doc.fillColor('#333333').fontSize(9).font('Helvetica')
       .text('Subtotal:', 350, currentY, { align: 'right', width: 100 })
       .text(`Rs ${(order.totalAmount - (order.deliveryCharge || 0)).toLocaleString()}`, 470, currentY, { align: 'right', width: 80 });

    currentY += 15;
    doc.text(`Delivery Charge (${order.courierService || 'Courier'}):`, 300, currentY, { align: 'right', width: 150 })
       .text(`Rs ${(order.deliveryCharge || 0).toLocaleString()}`, 470, currentY, { align: 'right', width: 80 });

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
    };

    await transporter.sendMail(mailOptions);
    console.log(`Status email sent successfully to ${customerEmail}`);
  } catch (error) {
    console.error(`Error sending status email to ${customerEmail}:`, error.message);
  }
};

module.exports = {
  sendInvoiceEmail,
  sendStatusEmail,
};
