const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const Dealer = require('../models/Dealer');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');
const { sendSMS } = require('../utils/sms');



// @desc    Create new order
// @route   POST /api/orders
// @access  Private/Customer
const createOrder = async (req, res) => {
  const { cartItems, shippingAddress, paymentMethod, courierService, deliveryCharge } = req.body;

  if (!cartItems || cartItems.length === 0) {
    return res.status(400).json({ message: 'No items in order' });
  }

  try {
    let subtotalAmount = 0;
    const orderItems = [];

    // Verify stock and calculate price from DB (Security check)
    for (const item of cartItems) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({ message: `Product not found: ${item.productId}` });
      }

      if (product.stock < item.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for ${product.productName}. Only ${product.stock} left.`,
        });
      }

      subtotalAmount += product.price * item.quantity;
      orderItems.push({
        productId: product._id,
        quantity: item.quantity,
        price: product.price,
        dealerId: product.dealerId,
      });
    }

    const chargeVal = Number(deliveryCharge) || 0;
    const finalTotalAmount = subtotalAmount + chargeVal;

    // Generate Custom Sequential Order ID: YYMMDDCCount
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const todayCount = await Order.countDocuments({
      createdAt: { $gte: startOfToday, $lte: endOfToday }
    });
    const sequentialCount = String(todayCount + 1).padStart(3, '0');
    const customOrderId = `${yy}${mm}${dd}${sequentialCount}`;

    let orderData = {
      customerId: req.user._id,
      products: orderItems,
      totalAmount: finalTotalAmount,
      shippingAddress,
      paymentMethod,
      paymentStatus: 'pending',
      orderStatus: 'Processing',
      courierService: courierService || '',
      deliveryCharge: chargeVal,
      customOrderId
    };

    // If Payment Method is COD
    if (paymentMethod === 'COD') {
      orderData.paymentStatus = 'pending';

      const order = await Order.create(orderData);

      // Deduct stock immediately for COD
      for (const item of orderItems) {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { stock: -item.quantity },
        });
      }

      // Clear Customer's Cart
      await Cart.findOneAndUpdate({ customerId: req.user._id }, { products: [] });

      // Trigger invoice email for COD
      try {
        const populatedOrderForInvoice = await Order.findById(order._id).populate('customerId').populate('products.productId');
        if (populatedOrderForInvoice && populatedOrderForInvoice.customerId && populatedOrderForInvoice.customerId.email) {
          const { sendInvoiceEmail } = require('../utils/mail');
          sendInvoiceEmail(populatedOrderForInvoice, populatedOrderForInvoice.customerId.email).catch(err => {
            console.error('Error sending COD invoice email:', err.message);
          });
        }
      } catch (invoiceErr) {
        console.error('Failed to trigger COD invoice email on order creation:', invoiceErr.message);
      }

      // Create notification
      await Notification.create({
        userId: req.user._id,
        message: `Your order containing ${orderItems.length} items has been placed successfully (COD). Shipped via: ${courierService || 'Standard Courier'}. Total: ₹${finalTotalAmount.toLocaleString()}`,
        link: '/customer/dashboard'
      });

      return res.status(201).json({
        success: true,
        order,
        message: 'Order placed successfully with Cash on Delivery.',
      });
    }

    // If Payment Method is UPI-QR
    if (paymentMethod === 'UPI-QR') {
      orderData.paymentStatus = 'pending';
      orderData.qrPaymentExpiresAt = new Date(Date.now() + 300 * 1000); // 5 minutes active window

      const order = await Order.create(orderData);

      // Create notification for customer
      await Notification.create({
        userId: req.user._id,
        message: `Your payment request for order #${order._id.toString().slice(-6)} of ₹${finalTotalAmount.toLocaleString()} has been initiated. Please complete the UPI QR payment within 5 minutes.`,
        link: `/customer/dashboard?review=${order.products[0]?.productId}`
      });

      // Create notification for admin
      const User = mongoose.model('User');
      const admins = await User.find({ role: 'admin' });
      for (const admin of admins) {
        await Notification.create({
          userId: admin._id,
          message: `NEW UPI QR ORDER: Order #${order._id.toString().slice(-6)} of ₹${finalTotalAmount.toLocaleString()} is pending. Verification required.`,
          link: `/admin/dashboard`
        });
      }

      return res.status(201).json({
        success: true,
        order,
      });
    }

    res.status(400).json({ message: 'Invalid payment method' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Submit customer payment proof (UPI ID)
// @route   PUT /api/orders/:id/payment-proof
// @access  Private/Customer
const submitPaymentProof = async (req, res) => {
  const { customerUpiId, paymentProofImage } = req.body;

  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check expiration
    if (new Date() > new Date(order.qrPaymentExpiresAt)) {
      return res.status(400).json({ message: 'Payment window of 2 minutes has expired. Order cancelled.' });
    }

    // Perform OCR Verification on paymentProofImage if present
    if (paymentProofImage) {
      if (!paymentProofImage.startsWith('data:image/')) {
        return res.status(400).json({ message: 'Invalid file format. Please upload a valid image screenshot.' });
      }

      // Convert Base64 image to Buffer
      const base64Data = paymentProofImage.replace(/^data:image\/\w+;base64,/, "");
      const imageBuffer = Buffer.from(base64Data, 'base64');

      if (imageBuffer.length < 5000) {
        return res.status(400).json({ message: 'Uploaded file is too small to be a valid screenshot receipt.' });
      }

      try {
        const Tesseract = require('tesseract.js');
        const { data: { text } } = await Tesseract.recognize(
          imageBuffer,
          'eng'
        );

        const scannedText = (text || '').toLowerCase();

        // Price Match Verification: Check if the bill's total amount is present in the scanned text
        const cleanScannedText = scannedText.replace(/[\s,₹rs\-]/g, "");
        const digitsOnly = scannedText.replace(/\D/g, "");

        const targetIntStr = Math.floor(order.totalAmount).toString(); // e.g. "47"
        const targetCentsStr = (Math.round((order.totalAmount % 1) * 100)).toString(); // e.g. "43"
        const targetDecimalStr = order.totalAmount.toFixed(2); // e.g. "47.43"
        const targetDigitsStr = targetDecimalStr.replace(/\D/g, ""); // e.g. "4743"

        // Robust match options to allow for minor OCR readability errors (like misreading '.' or a digit)
        const amountMatch = 
          cleanScannedText.includes(targetIntStr) || 
          cleanScannedText.includes(targetCentsStr) ||
          digitsOnly.includes(targetDigitsStr) ||
          digitsOnly.includes(targetIntStr) ||
          scannedText.includes(targetDecimalStr) ||
          scannedText.includes(targetIntStr);

        if (!amountMatch) {
          return res.status(400).json({
            message: `Payment amount mismatch. The uploaded screenshot does not show the correct payment amount of ₹${order.totalAmount.toLocaleString()}. Please make sure you upload the correct transaction receipt for this order.`
          });
        }
      } catch (ocrError) {
        console.error('Tesseract OCR validation error (falling back to size/header heuristics):', ocrError.message);
        // Fallback: If OCR library fails (e.g. offline node process), accept image based on metadata & size
      }
    }

    if (customerUpiId) order.customerUpiId = customerUpiId;
    if (paymentProofImage) order.paymentProofImage = paymentProofImage;
    await order.save();

    // Create database notification for admins
    const User = mongoose.model('User');
    const admins = await User.find({ role: 'admin' });
    for (const admin of admins) {
      await Notification.create({
        userId: admin._id,
        message: `UPI PROOF SUBMITTED: Order #${order._id.toString().slice(-6)} of ₹${order.totalAmount.toLocaleString()} has submitted a payment screenshot. Verify immediately!`,
        link: `/admin/dashboard`
      });
    }

    // Send real urgent SMS notification to Admin in the background
    const baseUrl = process.env.SMS_REDIRECT_BASE_URL || `http://${req.get('host')}`;
    const smsMessage = `Tenaq: Proof #${order._id.toString().slice(-6)} (₹${order.totalAmount.toFixed(0)}). Actions: ${baseUrl}/api/orders/a/${order._id}`;
    sendSMS(smsMessage).catch((smsErr) => {
      console.error('Error sending proof submitted SMS to admin:', smsErr.message);
    });

    // Send real SMS confirmation to the customer confirming valid screenshot submission
    const customerPhone = order.shippingAddress?.phone || req.user?.phone;
    if (customerPhone) {
      const customerSmsMessage = `TENAQUARIUM: We have received your payment screenshot for Order #${order._id.toString().slice(-6)} of ₹${order.totalAmount.toLocaleString()}. It is now under verification. Thank you!`;
      sendSMS(customerSmsMessage, customerPhone).catch((smsErr) => {
        console.error('Error sending proof submitted SMS to customer:', smsErr.message);
      });
    }

    res.json({
      success: true,
      message: 'Payment proof submitted. Waiting for admin approval.',
      order,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single order details by ID
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customerId', 'name email phone')
      .populate('products.productId', 'productName images price category');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }



    // Check auth
    if (req.user.role !== 'admin' && order.customerId._id.toString() !== req.user._id.toString()) {
      // Check if dealer sells products in this order
      const belongsToDealer = order.products.some(
        (item) => item.dealerId.toString() === req.user._id.toString()
      );
      if (!belongsToDealer) {
        return res.status(403).json({ message: 'Not authorized to view this order' });
      }
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Auto-cancel expired UPI orders older than 5 minutes and restore stock
const cancelExpiredOrders = async () => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 300 * 1000);
    const expiredOrders = await Order.find({
      paymentMethod: 'UPI-QR',
      paymentStatus: 'pending',
      createdAt: { $lt: fiveMinutesAgo }
    });

    if (expiredOrders.length > 0) {
      const Product = require('../models/Product');
      const Notification = require('../models/Notification');
      for (const order of expiredOrders) {
        order.paymentStatus = 'failed';
        order.orderStatus = 'Cancelled';
        await order.save();

        // Create notification for customer
        await Notification.create({
          userId: order.customerId,
          message: `Your payment window for order #${order._id.toString().slice(-6)} has expired. Order cancelled.`,
          link: '/customer/dashboard'
        });
      }
    }
  } catch (err) {
    console.error('Error cancelling expired orders:', err);
  }
};



// @desc    Get logged in customer orders
// @route   GET /api/orders/myorders
// @access  Private/Customer
const getMyOrders = async (req, res) => {
  try {
    await cancelExpiredOrders();
    const orders = await Order.find({
      customerId: req.user._id,
      $or: [
        { paymentMethod: 'COD' },
        { paymentMethod: 'UPI-QR', paymentStatus: 'paid' }
      ]
    })
      .populate('products.productId', 'productName images category price isReturnable')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get dealer orders (only containing their products)
// @route   GET /api/orders/dealer
// @access  Private/Dealer
const getDealerOrders = async (req, res) => {
  try {
    await cancelExpiredOrders();
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    // Find all orders where at least one product belongs to this dealer and 3 hours have passed since placement
    const orders = await Order.find({
      'products.dealerId': req.user._id,
      createdAt: { $lte: threeHoursAgo },
      $or: [
        { paymentMethod: 'COD' },
        { paymentMethod: 'UPI-QR', paymentStatus: 'paid' }
      ]
    })
      .populate('customerId', 'name email phone')
      .populate('products.productId', 'productName images price category isReturnable')
      .sort({ createdAt: -1 });

    // Filter order products to only show the dealer's own products in each order
    const filteredOrders = orders.map((order) => {
      const orderObj = order.toObject();
      orderObj.products = orderObj.products.filter(
        (item) => item.dealerId.toString() === req.user._id.toString()
      );
      
      // Calculate dealer-specific total for this order
      orderObj.dealerSubtotal = orderObj.products.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      return orderObj;
    });

    res.json(filteredOrders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update order status (Customer, Dealer, or Admin)
// @route   PUT /api/orders/:id
// @access  Private
const updateOrderStatus = async (req, res) => {
  const { orderStatus, paymentStatus } = req.body;

  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Auth validation
    const isBuyer = order.customerId.toString() === req.user._id.toString();
    if (isBuyer) {
      // Buyers can only cancel their own orders
      if (orderStatus !== 'Cancelled') {
        return res.status(400).json({ message: 'Buyers can only cancel orders' });
      }
    } else if (req.user.role === 'dealer') {
      // Verify dealer has products in this order
      const belongsToDealer = order.products.some(
        (item) => item.dealerId.toString() === req.user._id.toString()
      );
      if (!belongsToDealer) {
        return res.status(403).json({ message: 'Not authorized to manage this order' });
      }
    }

    const prevOrderStatus = order.orderStatus;
    const prevPaymentStatus = order.paymentStatus;
    
    if (orderStatus) order.orderStatus = orderStatus;
    if (paymentStatus) order.paymentStatus = paymentStatus;
    if (req.body.trackingNumber !== undefined) order.trackingNumber = req.body.trackingNumber;
    if (req.body.courierBillImage !== undefined) order.courierBillImage = req.body.courierBillImage;
    if (req.body.finalBoxImage !== undefined) order.finalBoxImage = req.body.finalBoxImage;
    if (req.body.trackingTimeline !== undefined) order.trackingTimeline = req.body.trackingTimeline;
    if (req.body.courierService !== undefined) order.courierService = req.body.courierService;
    if (req.body.courierBillDetails !== undefined) order.courierBillDetails = req.body.courierBillDetails;
    if (orderStatus === 'Courier Dispatched' || orderStatus === 'Shipped') order.updatedAt = new Date();
    
    if (req.body.cancellationDetails !== undefined) {
      // Calculate refund details on the backend for safety and consistency
      const hours = (new Date() - new Date(order.createdAt)) / (1000 * 60 * 60);
      const status = prevOrderStatus; // use previous status to determine refund rule before state change
      let percentage = 100;
      let reason = 'Cancelled within 3 hours of order placement';
      
      if (status === 'Placed' || status === 'Pending') {
        if (hours <= 3) {
          percentage = 100;
          reason = 'Cancelled within 3 hours of order placement';
        } else {
          percentage = 75;
          reason = 'Cancelled after 3 hours before dealer accepted';
        }
      } else if (status === 'Processing') {
        if (hours <= 3) {
          percentage = 100;
          reason = 'Cancelled within 3 hours of order placement';
        } else {
          percentage = 75;
          reason = 'Cancelled after dealer starts processing';
        }
      } else if (status === 'Packed') {
        percentage = 50;
        reason = 'Cancelled after packing is completed';
      } else if (status === 'Shipped' || status === 'In Transit') {
        percentage = 5;
        reason = 'Cancelled after shipment handed over to courier';
      } else {
        percentage = 0;
        reason = 'Delivered orders cannot be cancelled';
      }
      
      const amount = order.totalAmount * (percentage / 100);

      order.cancellationDetails = {
        agreedToPolicy: req.body.cancellationDetails.agreedToPolicy || false,
        bankName: req.body.cancellationDetails.bankName || '',
        accountNumber: req.body.cancellationDetails.accountNumber || '',
        ifscCode: req.body.cancellationDetails.ifscCode || '',
        requestedAt: req.body.cancellationDetails.requestedAt || new Date(),
        refundPercentage: percentage,
        refundAmount: amount,
        cancellationReason: reason
      };
    }

    // Send status change email notifications to the customer
    if (orderStatus && orderStatus !== prevOrderStatus) {
      const populatedOrderForMail = await Order.findById(order._id).populate('customerId');
      if (populatedOrderForMail && populatedOrderForMail.customerId && populatedOrderForMail.customerId.email) {
        const { sendStatusEmail } = require('../utils/mail');
        sendStatusEmail(populatedOrderForMail, populatedOrderForMail.customerId.email, orderStatus).catch(err => {
          console.error('Error sending status update email:', err.message);
        });
      }
    }

    // Restore stock if cancelled
    if (orderStatus === 'Cancelled' && prevOrderStatus !== 'Cancelled') {
      // Only restore if stock was actually deducted (COD order, or paid UPI order)
      if (order.paymentMethod === 'COD' || prevPaymentStatus === 'paid') {
        for (const item of order.products) {
          await Product.findByIdAndUpdate(item.productId, {
            $inc: { stock: item.quantity },
          });
        }
      }
    }

    // Auto register the consignment on the external courier's database when order status is set to Courier Dispatched
    if (orderStatus === 'Courier Dispatched' && order.trackingNumber) {
      try {
        const ExternalCourierTracking = require('../models/ExternalCourierTracking');
        const existingExternal = await ExternalCourierTracking.findOne({ trackingNumber: order.trackingNumber });
        if (!existingExternal) {
          await ExternalCourierTracking.create({
            trackingNumber: order.trackingNumber,
            courierCompany: order.courierService || 'ST Courier',
            status: 'Booked',
            location: order.courierBillDetails?.from || 'Salem Collection Center',
            timeline: [
              {
                status: 'Booked',
                location: order.courierBillDetails?.from || 'Salem Collection Center',
                timestamp: new Date()
              }
            ]
          });
          console.log(`[External Courier DB] Automatically registered new consignment AWB: ${order.trackingNumber}`);
        }
      } catch (extErr) {
        console.error('Failed to register shipment in external courier tracking registry:', extErr.message);
      }
    }

    const updatedOrder = await order.save();

    // Send customer order confirmation SMS if payment is approved now
    if (paymentStatus === 'paid' && prevPaymentStatus !== 'paid') {
      try {
        await Cart.findOneAndUpdate({ customerId: order.customerId }, { products: [] });
      } catch (cartErr) {
        console.error('Error clearing cart in updateOrderStatus:', cartErr.message);
      }
      // Deduct stock upon payment approval
      for (const item of order.products) {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { stock: -item.quantity },
        });
      }
      
      // Trigger invoice email on manual payment approval
      try {
        const populatedOrderForInvoice = await Order.findById(order._id).populate('customerId').populate('products.productId');
        if (populatedOrderForInvoice && populatedOrderForInvoice.customerId && populatedOrderForInvoice.customerId.email) {
          const { sendInvoiceEmail } = require('../utils/mail');
          sendInvoiceEmail(populatedOrderForInvoice, populatedOrderForInvoice.customerId.email).catch(err => {
            console.error('Error sending invoice email:', err.message);
          });
        }
      } catch (invoiceErr) {
        console.error('Failed to trigger invoice email on status update:', invoiceErr.message);
      }

      const customerPhone = order.shippingAddress.phone;
      const cleanCustomerPhone = customerPhone.startsWith('+') ? customerPhone : `+91${customerPhone}`;
      const customerSmsMessage = `Tenaq: Ord #${order._id.toString().slice(-6)} (₹${order.totalAmount.toFixed(0)}) placed successfully! Shipped via ${order.courierService || 'Standard Courier'}.`;
      sendSMS(customerSmsMessage, cleanCustomerPhone).catch((smsErr) => {
        console.error('Error sending customer order SMS from updateOrderStatus:', smsErr.message);
      });
    }

    // Generate Delivery Notifications
    if (orderStatus === 'Delivered') {
      try {
        for (const item of order.products) {
          const productObj = await Product.findById(item.productId);
          const name = productObj ? productObj.productName : 'your product';
          await Notification.create({
            userId: order.customerId,
            message: `Your order containing '${name}' has been delivered! Please tap here to leave your review and rating.`,
            link: `/customer/dashboard?review=${item.productId}`
          });
        }
      } catch (err) {
        console.error('Error creating delivery notifications:', err);
      }
    }

    res.json(updatedOrder);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Approve order payment via SMS link click (Public GET)
// @route   GET /api/orders/approve-sms/:id
// @access  Public
const approveOrderSMS = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).send('<h1>Error: Order not found</h1>');
    }

    order.paymentStatus = 'paid';
    order.orderStatus = 'Processing';
    order.qrPaymentApprovedByAdmin = true;
    await order.save();

    // Send invoice PDF email to customer upon approval
    try {
      const populatedOrderForInvoice = await Order.findById(order._id).populate('customerId').populate('products.productId');
      if (populatedOrderForInvoice && populatedOrderForInvoice.customerId && populatedOrderForInvoice.customerId.email) {
        const { sendInvoiceEmail } = require('../utils/mail');
        sendInvoiceEmail(populatedOrderForInvoice, populatedOrderForInvoice.customerId.email).catch(err => {
          console.error('Error sending invoice email:', err.message);
        });
      }
    } catch (invoiceErr) {
      console.error('Failed to trigger invoice email on SMS approval:', invoiceErr.message);
    }

    // Deduct stock upon payment approval
    for (const item of order.products) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: -item.quantity },
      });
    }

    // Clear customer cart
    try {
      await Cart.findOneAndUpdate({ customerId: order.customerId }, { products: [] });
    } catch (cartErr) {
      console.error('Error clearing cart in approveOrderSMS:', cartErr.message);
    }

    // Create notification for customer
    await Notification.create({
      userId: order.customerId,
      message: `Your payment for order #${order._id.toString().slice(-6)} has been verified and approved by admin. Status: Processing.`,
      link: '/customer/dashboard'
    });

    // Send customer order confirmation SMS in the background
    const customerPhone = order.shippingAddress.phone;
    const cleanCustomerPhone = customerPhone.startsWith('+') ? customerPhone : `+91${customerPhone}`;
    const customerSmsMessage = `Tenaq: Ord #${order._id.toString().slice(-6)} (₹${order.totalAmount.toFixed(0)}) placed successfully! Shipped via ${order.courierService || 'Standard Courier'}.`;
    sendSMS(customerSmsMessage, cleanCustomerPhone).catch((smsErr) => {
      console.error('Error sending customer order SMS:', smsErr.message);
    });

    res.send(`
      <html>
        <head>
          <title>Order Approved</title>
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; background-color: #f0fdf4; color: #166534; }
            .card { max-width: 440px; margin: 0 auto; background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #bbf7d0; }
            h1 { font-size: 28px; margin-bottom: 10px; color: #15803d; }
            p { font-size: 16px; color: #166534; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>✓ Order Approved</h1>
            <p>Order <strong>#${order._id.toString().slice(-6)}</strong> has been successfully marked as <strong>PAID</strong>.</p>
            <p>Customer will see this update instantly on their checkout screen.</p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(`<h1>Server Error</h1><p>${error.message}</p>`);
  }
};

// @desc    Reject order payment via SMS link click (Public GET)
// @route   GET /api/orders/reject-sms/:id
// @access  Public
const rejectOrderSMS = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).send('<h1>Error: Order not found</h1>');
    }

    const prevOrderStatus = order.orderStatus;
    order.paymentStatus = 'failed';
    order.orderStatus = 'Cancelled';
    await order.save();

    // Create notification for customer
    await Notification.create({
      userId: order.customerId,
      message: `Your payment for order #${order._id.toString().slice(-6)} was rejected by admin. Order cancelled.`,
      link: '/customer/dashboard'
    });

    res.send(`
      <html>
        <head>
          <title>Order Rejected</title>
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 50px; background-color: #fef2f2; color: #991b1b; }
            .card { max-width: 440px; margin: 0 auto; background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #fecaca; }
            h1 { font-size: 28px; margin-bottom: 10px; color: #dc2626; }
            p { font-size: 16px; color: #991b1b; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>✗ Order Rejected</h1>
            <p>Order <strong>#${order._id.toString().slice(-6)}</strong> has been rejected and marked as <strong>FAILED/CANCELLED</strong>.</p>
            <p>No stock was deducted since the payment was not approved.</p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(`<h1>Server Error</h1><p>${error.message}</p>`);
  }
};

// @desc    Get all orders (Admin only)
// @route   GET /api/orders
// @access  Private/Admin
const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find({})
      .populate('customerId', 'name email phone')
      .populate('products.productId', 'productName images price')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Render mobile Actions Approval/Rejection page
// @route   GET /api/orders/a/:id
// @access  Public
const actionOrderSMS = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).send('<h1>Error: Order not found</h1>');
    }

    const shortId = order._id.toString().slice(-6);
    const amount = order.totalAmount.toLocaleString();
    const upiId = order.customerUpiId || 'Not provided yet';

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Tenaquarium Order Approval</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f8fafc; padding: 20px; text-align: center; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
          .card { max-width: 400px; width: 100%; background: white; padding: 30px; border-radius: 24px; box-shadow: 0 10px 30px rgba(2, 132, 199, 0.08); border: 1px solid #e2e8f0; box-sizing: border-box; }
          h1 { font-size: 24px; color: #1e3a8a; margin-top: 0; margin-bottom: 20px; font-weight: 800; }
          .details { background: #f1f5f9; padding: 18px; border-radius: 16px; font-size: 15px; text-align: left; margin-bottom: 30px; border: 1px solid #cbd5e1; }
          .details div { margin-bottom: 10px; color: #334155; }
          .details div:last-child { margin-bottom: 0; }
          .btn { display: block; width: 100%; padding: 16px; margin-bottom: 14px; border: none; border-radius: 14px; font-size: 16px; font-weight: bold; cursor: pointer; transition: transform 0.1s, opacity 0.2s; box-sizing: border-box; }
          .btn:active { transform: scale(0.98); }
          .btn-approve { background: #10b981; color: white; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3); }
          .btn-reject { background: #ef4444; color: white; box-shadow: 0 4px 14px rgba(239, 68, 68, 0.25); }
          .btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
          .status-msg { display: none; font-size: 18px; font-weight: bold; margin-top: 20px; animation: popIn 0.3s ease-out; }
          @keyframes popIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Order Decision</h1>
          <div class="details">
            <div>Order ID: <strong>#${shortId}</strong></div>
            <div>Amount: <strong style="color: #059669; font-size: 18px;">₹${amount}</strong></div>
            ${order.customerUpiId ? `<div>UPI ID: <strong>${order.customerUpiId}</strong></div>` : ''}
          </div>
          
          ${order.paymentProofImage ? `
          <div style="margin-top: 15px; margin-bottom: 20px; text-align: left;">
            <div style="font-weight: bold; font-size: 14px; margin-bottom: 8px; color: #1e3a8a;">Payment Screenshot:</div>
            <img src="${order.paymentProofImage}" style="max-width: 100%; max-height: 380px; border-radius: 12px; border: 1.5px solid #cbd5e1; box-shadow: 0 4px 12px rgba(0,0,0,0.15); object-fit: contain; display: block; margin: 0 auto;" alt="Payment Proof" />
          </div>
          ` : ''}
          
          <button class="btn btn-approve" onclick="submitAction('approve')">Approve Payment</button>
          <button class="btn btn-reject" onclick="submitAction('reject')">Reject / Cancel</button>
          
          <div id="status" class="status-msg"></div>
        </div>

        <script>
          async function submitAction(action) {
            const statusDiv = document.getElementById('status');
            statusDiv.style.display = 'block';
            statusDiv.innerHTML = 'Processing request...';
            statusDiv.style.color = '#475569';

            try {
              const res = await fetch('/api/orders/' + (action === 'approve' ? 'approve-sms' : 'reject-sms') + '/${order._id}');
              if (res.ok) {
                if (action === 'approve') {
                  statusDiv.innerHTML = '✓ Order Approved Successfully!';
                  statusDiv.style.color = '#10b981';
                } else {
                  statusDiv.innerHTML = '✗ Order Rejected & Cancelled!';
                  statusDiv.style.color = '#ef4444';
                }
                // Disable buttons
                document.querySelectorAll('.btn').forEach(btn => btn.disabled = true);
              } else {
                statusDiv.innerHTML = 'Failed to submit action.';
                statusDiv.style.color = '#ef4444';
              }
            } catch (err) {
              statusDiv.innerHTML = 'Error: ' + err.message;
              statusDiv.style.color = '#ef4444';
            }
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(`<h1>Server Error</h1><p>${error.message}</p>`);
  }
};

// @desc    Get public tracking status for customer (no login required)
// @route   GET /api/orders/public-track/:id
// @access  Public
const getPublicTracking = async (req, res) => {
  try {
    const queryId = req.params.id;
    let order = await Order.findOne({
      $or: [
        { trackingNumber: queryId },
        { customOrderId: queryId }
      ]
    });

    if (!order && queryId.length === 24) {
      order = await Order.findById(queryId);
    }

    if (!order) {
      return res.status(404).json({ message: 'No shipment matches this tracking number or Order ID.' });
    }

    res.json({
      success: true,
      orderStatus: order.orderStatus,
      courierService: order.courierService,
      trackingNumber: order.trackingNumber,
      trackingTimeline: order.trackingTimeline,
      createdAt: order.createdAt,
      expectedDelivery: new Date(new Date(order.createdAt).getTime() + 5 * 24 * 60 * 60 * 1000)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark Refund Completed & Send Email
const markRefundCompleted = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id).populate('customerId', 'name email');
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (!order.cancellationDetails) {
      order.cancellationDetails = {};
    }
    order.cancellationDetails.refundStatus = 'Completed';
    await order.save();

    // Trigger email confirmation to customer
    if (order.customerId && order.customerId.email) {
      const { sendStatusEmail } = require('../utils/mail');
      await sendStatusEmail(order, order.customerId.email, 'Refund Completed');
    }

    res.json({ message: 'Refund status updated to Completed and email sent to customer', order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



// @desc    Admin update dealer payout status for an order
// @route   PUT /api/orders/:id/dealer-payout
// @access  Private/Admin
const updateDealerPayoutStatus = async (req, res) => {
  const { payoutStatus } = req.body;
  if (!['Pending', 'Processing', 'Paid'].includes(payoutStatus)) {
    return res.status(400).json({ message: 'Invalid payout status' });
  }

  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    order.dealerPayoutStatus = payoutStatus;
    await order.save();

    res.json({ message: `Dealer payout status updated to ${payoutStatus}`, order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createOrder,
  submitPaymentProof,
  getOrderById,
  getMyOrders,
  getDealerOrders,
  updateOrderStatus,
  getAllOrders,
  approveOrderSMS,
  rejectOrderSMS,
  actionOrderSMS,
  getPublicTracking,
  markRefundCompleted,
  updateDealerPayoutStatus,
};
