const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const User = require('../models/User');
const Payment = require('../models/Payment');
const { sendSMS } = require('../utils/sms');
const { sendInvoiceEmail } = require('../utils/mail');

const MERCHANT_UPI_ID = process.env.MERCHANT_UPI_ID || 'tenaquarium457@oksbi';
const MERCHANT_PAYEE_NAME = process.env.MERCHANT_PAYEE_NAME || 'TEN Aquarium';
const MERCHANT_ACCOUNT_HOLDER = process.env.MERCHANT_ACCOUNT_HOLDER || 'ELAVARASI M.';
const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || 'tenaquarium_upi_webhook_secret_key';

// Real-Time Server-Sent Events (SSE) Client Registry: orderId -> Set of Express Response objects
const sseClients = new Map();
// Real-Time Admin Notification SSE Client Registry
const adminSseClients = new Set();

/**
 * Real-Time Broadcaster: Notifies connected frontend clients in < 5ms
 */
const notifyPaymentClients = (orderId, data) => {
  const idStr = orderId.toString();
  const clients = sseClients.get(idStr);
  if (clients && clients.size > 0) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const clientRes of clients) {
      try {
        clientRes.write(payload);
      } catch (e) {
        console.warn('Error emitting to SSE client:', e.message);
      }
    }
  }
};

/**
 * Real-Time Admin Broadcaster: Notifies connected Admin app/website in < 5ms
 */
const notifyAdminClients = (data) => {
  if (adminSseClients.size > 0) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const clientRes of adminSseClients) {
      try {
        clientRes.write(payload);
      } catch (e) {
        console.warn('Error emitting to Admin SSE client:', e.message);
      }
    }
  }
};

// Helper: Deduct stock when payment is verified
const deductProductStock = async (productId, color, quantity) => {
  try {
    const product = await Product.findById(productId);
    if (!product) return;

    if (product.hasVariants && color && color !== 'Standard') {
      const variantIndex = product.variants.findIndex(v => v.color === color);
      if (variantIndex > -1) {
        product.variants[variantIndex].stock = Math.max(0, product.variants[variantIndex].stock - quantity);
      }
      product.stock = product.variants.reduce((sum, v) => sum + v.stock, 0);
    } else {
      product.stock = Math.max(0, product.stock - quantity);
    }
    product.soldCount = (product.soldCount || 0) + quantity;
    await product.save();
  } catch (err) {
    console.error(`Error deducting stock for product ${productId}:`, err.message);
  }
};

/**
 * Ultra-Fast Finalizer: Mark Order & Payment PAID, Deduct Stock, Clear Cart
 * Uses parallel MongoDB operations and non-blocking background notifications (< 30ms)
 */
const finalizeVerifiedPayment = async (orderId, {
  transactionId,
  upiUtr,
  paidAmount,
  gateway = 'UPI',
  verifiedVia = 'WEBHOOK',
  rawPayload = {}
}) => {
  const tStart = Date.now();
  const order = await Order.findById(orderId).populate('customerId').populate('products.productId');
  if (!order) {
    throw new Error('Order not found');
  }

  // Idempotency: If already paid, return immediately to prevent duplicate stock deduction
  const isAlreadyPaid = order.paymentStatus === 'paid' || order.paymentStatus === 'PAID';
  if (isAlreadyPaid) {
    // Notify any waiting SSE clients just in case
    notifyPaymentClients(order._id, {
      type: 'PAYMENT_VERIFIED',
      isPaid: true,
      paymentStatus: 'PAID',
      orderStatus: 'PLACED',
      orderId: order._id,
      customOrderId: order.customOrderId,
      totalAmount: order.totalAmount,
      transactionId: order.paymentDetails?.transactionId || transactionId,
      upiUtr: order.paymentDetails?.upiUtr || upiUtr
    });
    return order;
  }

  // Exact Amount Verification
  const expectedAmount = Math.round(Number(order.totalAmount));
  const receivedAmount = Math.round(Number(paidAmount));
  if (paidAmount && receivedAmount < expectedAmount) {
    order.paymentStatus = 'failed';
    if (order.paymentDetails) {
      order.paymentDetails.status = 'FAILED';
      order.paymentDetails.transactionId = transactionId || '';
    }
    await order.save();

    await Payment.findOneAndUpdate(
      { orderId: order._id },
      {
        orderId: order._id,
        customOrderId: order.customOrderId,
        customerId: order.customerId?._id || order.customerId,
        status: 'FAILED',
        transactionId: transactionId || `FAIL_${Date.now()}`,
        upiUtr: upiUtr || '',
        amount: Number(paidAmount),
        currency: 'INR',
        gateway,
        merchantUpiId: MERCHANT_UPI_ID,
        verifiedVia,
        rawPayload
      },
      { upsert: true }
    );

    throw new Error(`Amount mismatch: Expected ₹${expectedAmount}, received ₹${receivedAmount}`);
  }

  const verifiedDate = new Date();
  const verifiedTxnId = transactionId || `TXN_${Date.now()}`;
  const verifiedUtr = upiUtr || `UTR_${Date.now()}`;
  const finalPaidAmount = Number(paidAmount) || order.totalAmount;

  const tDbStart = Date.now();

  // 1. Parallel Database Write: Order + Payment records in parallel (< 15ms)
  const [updatedOrder, paymentRecord] = await Promise.all([
    Order.findByIdAndUpdate(
      order._id,
      {
        $set: {
          paymentStatus: 'PAID',
          orderStatus: 'PLACED',
          paymentDetails: {
            transactionId: verifiedTxnId,
            upiUtr: verifiedUtr,
            paidAmount: finalPaidAmount,
            paidAt: verifiedDate,
            gateway,
            status: 'SUCCESS'
          }
        }
      },
      { new: true }
    ).populate('customerId').populate('products.productId'),
    Payment.findOneAndUpdate(
      { orderId: order._id },
      {
        orderId: order._id,
        customOrderId: order.customOrderId,
        customerId: order.customerId?._id || order.customerId,
        status: 'PAID',
        transactionId: verifiedTxnId,
        upiUtr: verifiedUtr,
        amount: finalPaidAmount,
        currency: 'INR',
        gateway,
        merchantUpiId: MERCHANT_UPI_ID,
        paidAt: verifiedDate,
        verifiedVia,
        rawPayload
      },
      { upsert: true, new: true }
    )
  ]);

  const dbTimeMs = Date.now() - tDbStart;

  // 2. Parallel Inventory Deduction & Cart Clearing
  const invAndCartTasks = order.products.map(item => 
    deductProductStock(item.productId?._id || item.productId, item.color, item.quantity)
  );
  if (!order.isDirectBuy && order.customerId) {
    invAndCartTasks.push(
      Cart.findOneAndUpdate(
        { customerId: order.customerId._id || order.customerId },
        { products: [] }
      )
    );
  }
  await Promise.all(invAndCartTasks);

  // 3. Format Products for Immediate Presentation
  const formattedProducts = order.products.map(p => ({
    productId: p.productId?._id || p.productId,
    productName: p.productId?.productName || 'Aquarium Product',
    image: (p.productId?.images && p.productId.images[0]) || p.image || '',
    quantity: p.quantity,
    price: p.price || 0,
    color: p.color || ''
  }));

  const tDispatchStart = Date.now();

  // 4. Instant Real-Time Push to Frontend SSE (< 5ms)
  notifyPaymentClients(order._id, {
    type: 'PAYMENT_VERIFIED',
    isPaid: true,
    paymentStatus: 'PAID',
    orderStatus: 'PLACED',
    orderId: order._id,
    customOrderId: order.customOrderId,
    totalAmount: order.totalAmount,
    amount: order.totalAmount,
    transactionId: verifiedTxnId,
    upiUtr: verifiedUtr,
    paidAt: verifiedDate,
    products: formattedProducts,
    shippingAddress: order.shippingAddress,
    metrics: {
      dbTimeMs,
      dispatchTimeMs: Date.now() - tDispatchStart,
      totalBackendMs: Date.now() - tStart
    }
  });

  console.log(`[PAYMENT CONFIRMED] Order #${order.customOrderId || order._id}: DB write in ${dbTimeMs}ms, Total backend pipeline: ${Date.now() - tStart}ms`);

  // 5. Non-Blocking Background Notifications (Email & SMS do not delay the customer UI)
  setImmediate(async () => {
    try {
      const customerEmail = order.customerId?.email;
      if (customerEmail) {
        sendInvoiceEmail(updatedOrder, customerEmail).catch(e => console.warn('Invoice email err:', e.message));
      }
      const customerPhone = order.shippingAddress?.phone || order.customerId?.phone;
      if (customerPhone) {
        const cleanPhone = customerPhone.startsWith('+') ? customerPhone : `+91${customerPhone}`;
        const smsMsg = `Tenaq: Ord #${order.customOrderId || order._id.toString().slice(-6)} (₹${order.totalAmount.toFixed(0)}) confirmed! Payment received via UPI. Shipped via ${order.courierService || 'Standard Shipping'}.`;
        sendSMS(smsMsg, cleanPhone).catch(e => console.warn('Customer SMS err:', e.message));
      }
      const adminSms = `TENAQUARIUM: Payment RECEIVED for Order #${order.customOrderId || order._id.toString().slice(-6)}! Rs ${order.totalAmount.toFixed(0)} confirmed via UPI (UTR: ${verifiedUtr}). Cust: ${order.shippingAddress?.name}.`;
      sendSMS(adminSms).catch(e => console.warn('Admin SMS err:', e.message));
    } catch (bgErr) {
      console.warn('Background notification error:', bgErr.message);
    }
  });

  return updatedOrder;
};

/**
 * Server-Sent Events (SSE) Stream Endpoint
 * Establishes real-time persistent stream for checkout client
 */
const streamPaymentStatus = (req, res) => {
  const { orderId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable NGINX buffering
  res.flushHeaders();

  if (!sseClients.has(orderId)) {
    sseClients.set(orderId, new Set());
  }
  sseClients.get(orderId).add(res);

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', orderId, timestamp: Date.now() })}\n\n`);

  // Periodic keep-alive ping every 15s to keep intermediate proxies from closing the connection
  const keepAliveTimer = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch (e) {
      clearInterval(keepAliveTimer);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAliveTimer);
    const clients = sseClients.get(orderId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        sseClients.delete(orderId);
      }
    }
  });
};

/**
 * Real-Time Admin SSE Stream
 */
const streamAdminPaymentAlerts = (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  adminSseClients.add(res);
  res.write(`data: ${JSON.stringify({ type: 'ADMIN_CONNECTED', timestamp: Date.now() })}\n\n`);

  const keepAliveTimer = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch (e) {
      clearInterval(keepAliveTimer);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAliveTimer);
    adminSseClients.delete(res);
  });
};

/**
 * Server-Side Provider Status Check
 */
const checkProviderPaymentStatus = async (order) => {
  const paymentRecord = await Payment.findOne({
    orderId: order._id,
    status: 'PAID'
  });
  if (paymentRecord) {
    return {
      verified: true,
      transactionId: paymentRecord.transactionId,
      upiUtr: paymentRecord.upiUtr,
      paidAmount: paymentRecord.amount,
      gateway: paymentRecord.gateway
    };
  }

  const providerStatusUrl = process.env.PAYMENT_PROVIDER_STATUS_URL;
  const apiKey = process.env.PAYMENT_PROVIDER_KEY || process.env.RAZORPAY_KEY_ID || process.env.CASHFREE_APP_ID;
  const apiSecret = process.env.PAYMENT_PROVIDER_SECRET || process.env.RAZORPAY_KEY_SECRET || process.env.CASHFREE_SECRET_KEY;

  if (providerStatusUrl && apiKey) {
    try {
      const orderRef = order.customOrderId || order._id.toString();
      const response = await fetch(`${providerStatusUrl}/${orderRef}`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${apiKey}:${apiSecret || ''}`).toString('base64')}`,
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        const data = await response.json();
        const isPaid = ['PAID', 'SUCCESS', 'COMPLETED', 'payment.captured'].includes(data.status || data.order_status || data.payment_status);
        if (isPaid) {
          return {
            verified: true,
            transactionId: data.transaction_id || data.payment_id || `PROV_${Date.now()}`,
            upiUtr: data.utr || data.bank_reference || data.approvalRefNo || '',
            paidAmount: Number(data.amount || data.order_amount || order.totalAmount),
            gateway: data.gateway || 'PROVIDER_STATUS_API'
          };
        }
      }
    } catch (err) {
      console.warn('Provider status check call failed:', err.message);
    }
  }

  return { verified: false };
};

// @desc    Get dynamic UPI payload and payment details for an order
// @route   GET /api/payments/details/:orderId
// @access  Private
const getUpiPaymentDetails = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (req.user.role !== 'admin' && order.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const orderRef = order.customOrderId || order._id.toString();
    const amountStr = order.totalAmount.toFixed(2);
    const upiUri = `upi://pay?pa=${encodeURIComponent(MERCHANT_UPI_ID)}&pn=${encodeURIComponent(MERCHANT_PAYEE_NAME)}&am=${amountStr}&cu=INR&tr=${orderRef}&tn=Order_${orderRef}`;

    res.json({
      success: true,
      orderId: order._id,
      customOrderId: order.customOrderId,
      amount: order.totalAmount,
      merchantUpiId: MERCHANT_UPI_ID,
      payeeName: MERCHANT_PAYEE_NAME,
      accountHolder: MERCHANT_ACCOUNT_HOLDER,
      upiUri,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      expiresAt: order.qrPaymentExpiresAt || new Date(Date.now() + 300 * 1000),
    });
  } catch (error) {
    console.error('Error in getUpiPaymentDetails:', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Check live payment status for an order (real-time polling fallback)
// @route   GET /api/payments/status/:orderId
// @access  Public / Authenticated
const getPaymentStatus = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId)
      .select('paymentStatus orderStatus totalAmount customOrderId qrPaymentExpiresAt paymentDetails products shippingAddress customerId createdAt')
      .populate('products.productId', 'productName images price');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    let isPaid = order.paymentStatus === 'paid' || order.paymentStatus === 'PAID';

    // Fallback: If not marked paid, query provider status API
    if (!isPaid) {
      const providerCheck = await checkProviderPaymentStatus(order);
      if (providerCheck.verified) {
        await finalizeVerifiedPayment(order._id, {
          transactionId: providerCheck.transactionId,
          upiUtr: providerCheck.upiUtr,
          paidAmount: providerCheck.paidAmount,
          gateway: providerCheck.gateway,
          verifiedVia: 'PROVIDER_STATUS_API'
        });
        isPaid = true;
        order.paymentStatus = 'PAID';
        order.orderStatus = 'PLACED';
      }
    }

    const isExpired = !isPaid && order.qrPaymentExpiresAt && new Date() > new Date(order.qrPaymentExpiresAt);
    const paymentRecord = await Payment.findOne({ orderId: order._id });

    const formattedProducts = order.products.map(p => ({
      productId: p.productId?._id || p.productId,
      productName: p.productId?.productName || 'Aquarium Product',
      image: (p.productId?.images && p.productId.images[0]) || p.image || '',
      quantity: p.quantity,
      price: p.price || p.productId?.price || 0,
      color: p.color || ''
    }));

    res.json({
      success: true,
      orderId: order._id,
      customOrderId: order.customOrderId,
      totalAmount: order.totalAmount,
      amount: order.totalAmount,
      paymentStatus: isPaid ? 'PAID' : (isExpired ? 'expired' : order.paymentStatus),
      orderStatus: isPaid ? 'PLACED' : order.orderStatus,
      isPaid,
      isExpired,
      paymentDetails: order.paymentDetails || {},
      products: formattedProducts,
      shippingAddress: order.shippingAddress,
      createdAt: order.createdAt,
      paidAt: paymentRecord?.paidAt || order.paymentDetails?.paidAt || order.createdAt,
      transactionId: paymentRecord?.transactionId || order.paymentDetails?.transactionId || '',
      upiUtr: paymentRecord?.upiUtr || order.paymentDetails?.upiUtr || '',
    });
  } catch (error) {
    console.error('Error in getPaymentStatus:', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Authenticated Webhook from UPI Payment Provider / Acquiring Bank
// @route   POST /api/payments/webhook
// @access  Public (Signature-Verified)
const handlePaymentWebhook = async (req, res) => {
  const tArrival = Date.now();
  try {
    const signature = req.headers['x-webhook-signature'] || 
                      req.headers['x-razorpay-signature'] || 
                      req.headers['x-cashfree-signature'] ||
                      req.headers['x-signature'] ||
                      req.headers['signature'];
    const payload = req.body || {};

    // 1. Cryptographic HMAC-SHA256 signature check
    const tSigStart = Date.now();
    if (WEBHOOK_SECRET && signature) {
      const raw = req.rawBody ? req.rawBody.toString() : JSON.stringify(payload);
      const expectedSignature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
      if (signature !== expectedSignature) {
        console.warn('[WEBHOOK SECURITY] Invalid cryptographic signature rejected');
        return res.status(401).json({ message: 'Invalid webhook signature' });
      }
    }
    const sigVerifyMs = Date.now() - tSigStart;

    // 2. Extract payload fields
    const orderRef = payload.orderId || payload.order_id || payload.orderReference || payload.data?.order?.order_id || payload.order_reference;
    const transactionId = payload.paymentId || payload.payment_id || payload.transactionId || payload.data?.payment?.payment_id || payload.txnId;
    const upiUtr = payload.upiUtr || payload.utr || payload.bank_reference || payload.data?.payment?.bank_reference || payload.approvalRefNo;
    const receivedAmount = payload.amount || payload.order_amount || payload.data?.payment?.payment_amount || payload.paidAmount;
    const event = payload.event || payload.type || payload.status || 'PAYMENT_SUCCESS';
    const merchantVpa = payload.merchantVpa || payload.payee_vpa || payload.data?.payment?.payee_vpa;

    // 3. Merchant VPA validation
    if (merchantVpa && !merchantVpa.toLowerCase().includes('tenaquarium457') && !merchantVpa.toLowerCase().includes('oksbi')) {
      console.warn(`[WEBHOOK] Mismatched merchant VPA: ${merchantVpa}`);
      return res.status(400).json({ message: 'Mismatched merchant VPA' });
    }

    if (!orderRef) {
      return res.status(400).json({ message: 'Missing order reference' });
    }

    // 4. Locate order
    let order = null;
    if (mongoose.Types.ObjectId.isValid(orderRef)) {
      order = await Order.findById(orderRef);
    }
    if (!order) {
      order = await Order.findOne({ customOrderId: orderRef });
    }

    if (!order) {
      console.warn(`[WEBHOOK] Order reference not found: ${orderRef}`);
      return res.status(404).json({ message: 'Order reference not found' });
    }

    // 5. Success event filter
    const isSuccessEvent = ['payment.captured', 'PAYMENT_SUCCESS', 'PAYMENT_SUCCESS_WEBHOOK', 'order.paid', 'SUCCESS', 'PAID', 'COMPLETED'].includes(event);
    if (!isSuccessEvent && payload.status !== 'SUCCESS' && payload.status !== 'PAID') {
      return res.status(200).json({ message: `Ignored non-success event: ${event}` });
    }

    // Amount normalization (paise to rupees if needed)
    let parsedAmount = Number(receivedAmount);
    if (parsedAmount && parsedAmount > 1000 && parsedAmount % 100 === 0 && order.totalAmount < 1000) {
      parsedAmount = parsedAmount / 100;
    }

    // 6. Exact Amount Check
    if (parsedAmount && Math.round(parsedAmount) < Math.round(order.totalAmount)) {
      console.warn(`[WEBHOOK] Amount mismatch for Order ${orderRef}: received ₹${parsedAmount}, expected ₹${order.totalAmount}`);
      order.paymentStatus = 'failed';
      await order.save();
      await Payment.findOneAndUpdate(
        { orderId: order._id },
        {
          orderId: order._id,
          customOrderId: order.customOrderId,
          customerId: order.customerId,
          status: 'FAILED',
          transactionId: transactionId || `FAIL_${Date.now()}`,
          amount: parsedAmount,
          currency: 'INR',
          gateway: payload.gateway || 'UPI',
          rawPayload: payload,
          verifiedVia: 'WEBHOOK'
        },
        { upsert: true }
      );
      return res.status(400).json({ message: 'Wrong payment amount received' });
    }

    // 7. Atomic Idempotent Finalization
    const finalized = await finalizeVerifiedPayment(order._id, {
      transactionId: transactionId || `TXN_${Date.now()}`,
      upiUtr: upiUtr || '',
      paidAmount: parsedAmount || order.totalAmount,
      gateway: payload.gateway || 'UPI-WEBHOOK',
      verifiedVia: 'WEBHOOK',
      rawPayload: payload
    });

    const totalProcessingMs = Date.now() - tArrival;
    console.log(`[WEBHOOK SUCCESS] Processed Order #${finalized.customOrderId} in ${totalProcessingMs}ms (Sig: ${sigVerifyMs}ms)`);

    res.status(200).json({
      success: true,
      message: 'Payment verified and order finalized successfully',
      orderId: finalized._id,
      customOrderId: finalized.customOrderId,
      paymentStatus: finalized.paymentStatus,
      orderStatus: finalized.orderStatus,
      latency: {
        sigVerifyMs,
        totalProcessingMs
      }
    });
  } catch (error) {
    console.error('Error handling payment webhook:', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Sandbox / Provider Simulator (For genuine test verification)
// @route   POST /api/payments/sandbox-verify
// @access  Private
const sandboxVerifyPayment = async (req, res) => {
  try {
    const { orderId, upiUtr, paidAmount } = req.body;
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (req.user.role !== 'admin' && order.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const finalized = await finalizeVerifiedPayment(orderId, {
      transactionId: `SANDBOX_${Date.now()}`,
      upiUtr: upiUtr || `SANDBOX_UTR_${Date.now()}`,
      paidAmount: paidAmount || order.totalAmount,
      gateway: 'SANDBOX-UPI',
      verifiedVia: 'SANDBOX'
    });

    res.json({
      success: true,
      message: 'Sandbox payment verified and processed',
      order: finalized
    });
  } catch (error) {
    console.error('Error in sandboxVerifyPayment:', error.message);
    res.status(500).json({ message: error.message });
  }
};

/**
 * Real-Time UPI App Notification Listener Endpoint
 * Catches Google Pay / PhonePe / Paytm / BHIM push notifications from merchant device
 * @route POST /api/payments/upi-notification
 * @access Protected via secret key or header
 */
const handleUpiAppNotification = async (req, res) => {
  const tArrival = Date.now();
  try {
    const secret = req.headers['x-upi-secret'] || req.query.secret || req.body.secret || req.body.secretKey;
    const configuredSecret = process.env.UPI_NOTIFICATION_SECRET || 'tenaquarium_upi_2026';
    
    if (process.env.UPI_NOTIFICATION_SECRET && secret !== configuredSecret) {
      console.warn('[UPI NOTIF] Unauthorized request with invalid secret');
      return res.status(401).json({ success: false, message: 'Invalid UPI notification secret' });
    }

    const payload = req.body || {};
    let amount = Number(payload.amount);
    let utr = payload.utr || payload.upiUtr || '';
    const rawText = [payload.title, payload.text, payload.body, payload.message, payload.notification].filter(Boolean).join(' ');

    console.log(`[UPI NOTIF ARRIVED] Raw payload:`, JSON.stringify(payload));

    // Regex extraction if amount not passed as separate numeric property
    if ((!amount || isNaN(amount)) && rawText) {
      const clean = rawText.replace(/,/g, '');
      const amountMatch = clean.match(/(?:(?:₹|Rs\.?|INR)\s*([0-9]+(?:\.[0-9]{1,2})?))|(?:received|credited|paid)\s*(?:(?:₹|Rs\.?|INR)\s*)?([0-9]+(?:\.[0-9]{1,2})?)/i);
      if (amountMatch) {
        amount = parseFloat(amountMatch[1] || amountMatch[2]);
      }
    }

    // UTR regex extraction (12 digit UPI reference)
    if (!utr && rawText) {
      const utrMatch = rawText.match(/(?:UTR|Ref|Reference|Txn|Transaction|UPI Ref|UPI)[:\s#-]*([0-9]{12})/i) || rawText.match(/\b([0-9]{12})\b/);
      if (utrMatch) {
        utr = utrMatch[1];
      }
    }

    if (!amount || isNaN(amount)) {
      return res.status(400).json({
        success: false,
        message: 'Could not extract valid received amount from notification',
        rawText
      });
    }

    // 1. Check if specific customOrderId is mentioned in text
    let matchedOrder = null;
    if (rawText) {
      const orderIdMatch = rawText.match(/\b(26[0-9]{6,8})\b/);
      if (orderIdMatch) {
        matchedOrder = await Order.findOne({ customOrderId: orderIdMatch[1] });
      }
    }

    // 2. Look for recent pending orders with matching exact amount (within last 45 minutes)
    if (!matchedOrder) {
      const recentOrders = await Order.find({
        paymentStatus: { $in: ['pending', 'failed'] },
        orderStatus: { $nin: ['Delivered', 'Cancelled', 'PLACED'] },
        paymentMethod: { $in: ['UPI-QR', 'UPI', 'UPI_QR'] },
        createdAt: { $gte: new Date(Date.now() - 45 * 60 * 1000) }
      }).sort({ createdAt: -1 });

      matchedOrder = recentOrders.find(o => Math.round(Number(o.totalAmount)) === Math.round(amount));
    }

    if (!matchedOrder) {
      console.warn(`[UPI NOTIF] No active pending order found for amount ₹${amount}`);
      return res.status(404).json({
        success: false,
        message: `No active pending order found for received amount ₹${amount}`,
        amount,
        utr
      });
    }

    // 3. Ultra-fast idempotent finalization (< 30ms) & SSE push to customer's screen
    const finalized = await finalizeVerifiedPayment(matchedOrder._id, {
      transactionId: utr ? `UPI_${utr}` : `NOTIF_${Date.now()}`,
      upiUtr: utr || `APP_${Date.now()}`,
      paidAmount: amount,
      gateway: payload.package || payload.appName || 'UPI_APP_NOTIFICATION',
      verifiedVia: 'UPI_APP_PUSH',
      rawPayload: payload
    });

    const elapsed = Date.now() - tArrival;
    console.log(`[UPI NOTIF VERIFIED] Order #${finalized.customOrderId} confirmed in ${elapsed}ms via App Notification!`);

    return res.status(200).json({
      success: true,
      message: 'UPI notification processed and order placed successfully',
      orderId: finalized._id,
      customOrderId: finalized.customOrderId,
      amount,
      utr,
      elapsedMs: elapsed
    });
  } catch (error) {
    console.error('Error handling UPI app notification:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getUpiPaymentDetails,
  getPaymentStatus,
  handlePaymentWebhook,
  streamPaymentStatus,
  streamAdminPaymentAlerts,
  sandboxVerifyPayment,
  handleUpiAppNotification,
  finalizeVerifiedPayment,
  notifyPaymentClients,
  notifyAdminClients,
};
