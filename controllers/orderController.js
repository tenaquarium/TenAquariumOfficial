const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const Dealer = require('../models/Dealer');
const mongoose = require('mongoose');
const { sendSMS } = require('../utils/sms');
const Settings = require('../models/Settings');

const deductProductStock = async (productId, color, quantity) => {
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
};

const restoreProductStock = async (productId, color, quantity) => {
  const product = await Product.findById(productId);
  if (!product) return;

  if (product.hasVariants && color && color !== 'Standard') {
    const variantIndex = product.variants.findIndex(v => v.color === color);
    if (variantIndex > -1) {
      product.variants[variantIndex].stock += quantity;
    }
    product.stock = product.variants.reduce((sum, v) => sum + v.stock, 0);
  } else {
    product.stock += quantity;
  }
  product.soldCount = Math.max(0, (product.soldCount || 0) - quantity);
  await product.save();
};

// @desc    Create new order
// @route   POST /api/orders
// @access  Private/Customer
const createOrder = async (req, res) => {
  const { cartItems, shippingAddress, paymentMethod, courierService, deliveryCharge, policyAccepted, isDirectBuy } = req.body;

  if (!cartItems || cartItems.length === 0) {
    return res.status(400).json({ message: 'No items in order' });
  }

  // 1. Validate Policy Acceptance
  if (!policyAccepted) {
    return res.status(400).json({ message: 'Policy acceptance is required to place an order.' });
  }

  // 2. Validate Address & Pincode
  if (!shippingAddress || !shippingAddress.address || !shippingAddress.zip) {
    return res.status(400).json({ message: 'Shipping address and Pincode are required.' });
  }

  const pincodeRegex = /^[1-9][0-9]{5}$/;
  if (!pincodeRegex.test(shippingAddress.zip)) {
    return res.status(400).json({ message: 'Format of Pincode must be a 6-digit Indian PIN code.' });
  }

  // 3. Validate fish/plant shipments to North Indian states
  const southStates = ['tamil nadu', 'tamilnadu', 'kerala', 'karnataka', 'andhra pradesh', 'telangana', 'puducherry', 'pondicherry', 'goa'];
  const shippingStateClean = (shippingAddress.state || '').toLowerCase().replace(/\s+/g, '');
  const isSouthState = southStates.some(s => shippingStateClean.includes(s.replace(/\s+/g, '')));

  if (!isSouthState) {
    let hasLiveShipment = false;
    for (const item of cartItems) {
      const product = await Product.findById(item.productId);
      if (product && (product.category === 'Aquarium Fish' || product.category === 'Aquarium Plants')) {
        hasLiveShipment = true;
        break;
      }
    }
    if (hasLiveShipment) {
      return res.status(400).json({
        message: 'Transport not available for fish/plant shipment to North India. We can ship all other products. Please remove fish or plants from your cart to proceed.'
      });
    }
  }

  try {
    let subtotalAmount = 0;
    let totalWeight = 0;
    const orderItems = [];

    // Calculate total quantity per productId in cartItems for group-level MOQ validation
    const productQuantities = {};
    for (const item of cartItems) {
      const pid = item.productId.toString();
      productQuantities[pid] = (productQuantities[pid] || 0) + item.quantity;
    }

    // Verify stock, minimum quantity, and calculate price from DB (Security check)
    for (const item of cartItems) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({ message: `Product not found: ${item.productId}` });
      }

      // Validate stock
      const itemColor = item.color || '';
      if (product.hasVariants && itemColor && itemColor !== 'Standard') {
        const variant = product.variants.find(v => v.color === itemColor);
        if (!variant) {
          return res.status(400).json({
            message: `Color variant "${itemColor}" not found for ${product.productName}.`,
          });
        }
        if (variant.stock < item.quantity) {
          return res.status(400).json({
            message: `Insufficient stock for ${product.productName} (${itemColor}). Only ${variant.stock} left.`,
          });
        }
      } else {
        if (product.stock < item.quantity) {
          return res.status(400).json({
            message: `Insufficient stock for ${product.productName}. Only ${product.stock} left.`,
          });
        }
      }

      // Validate minimum quantity limit on cumulative product quantity
      const totalProductQty = productQuantities[product._id.toString()];
      const minQty = product.minQuantity || 2;
      if (totalProductQty < minQty) {
        return res.status(400).json({
          message: `Total quantity for ${product.productName} (${totalProductQty}) is below the minimum required quantity of ${minQty} items.`,
        });
      }

      // Calculate weight based on category
      let itemWeight = 0.5; // default 0.5kg
      if (product.category === 'Aquarium Tanks') {
        if (product.price < 1500) itemWeight = 5;
        else if (product.price < 5000) itemWeight = 15;
        else itemWeight = 40;
      } else if (product.category === 'Aquarium Filters') {
        if (product.price < 400) itemWeight = 0.5;
        else if (product.price < 1000) itemWeight = 0.75;
        else itemWeight = 1.2;
      } else if (product.category === 'Aquarium Lights') {
        if (product.price < 500) itemWeight = 0.5;
        else if (product.price < 2000) itemWeight = 1.0;
        else itemWeight = 2.0;
      } else if (product.category === 'Aquarium Fish') {
        const isPair = (product.productName || '').toLowerCase().includes('pair');
        itemWeight = isPair ? 0.28 : 0.14;
      } else if (product.category === 'Aquarium Plants') {
        itemWeight = 0.3;
      }
      totalWeight += itemWeight * item.quantity;

      // Calculate discount and custom offer on the server side
      const dealer = await Dealer.findOne({ userId: product.dealerId });
      const discount = dealer ? dealer.discountPercentage || 0 : 0;
      const customOfferText = dealer ? dealer.customOfferText || '' : '';

      const unitPrice = product.price;
      const discountedUnitPrice = discount > 0 ? unitPrice * (1 - discount / 100) : unitPrice;

      let itemCost = discountedUnitPrice * item.quantity;

      // Buy 3 Get 1 Free Check
      const isBuy3Get1 = customOfferText.toLowerCase().includes('buy 3 get 1') || customOfferText.toLowerCase().includes('buy3 get1');
      if (isBuy3Get1 && item.quantity >= 3) {
        const freeCount = Math.floor(item.quantity / 3);
        const billedQty = item.quantity - freeCount;
        itemCost = discountedUnitPrice * billedQty;
      }

      subtotalAmount += itemCost;
      orderItems.push({
        productId: product._id,
        color: itemColor,
        image: item.image || '',
        quantity: item.quantity,
        price: discountedUnitPrice, // Save actual paid discounted price
        dealerId: product.dealerId,
      });
    }

    // 3. Resolve Zone & Calculate Courier Rates
    let stateName = shippingAddress.state || '';

    // Fallback based on first digit of zip if state name is missing
    if (!stateName) {
      const firstDigit = shippingAddress.zip[0];
      if (firstDigit === '6') {
        stateName = 'Tamil Nadu';
      } else if (firstDigit === '5') {
        stateName = 'Karnataka';
      } else if (firstDigit === '4') {
        stateName = 'Maharashtra';
      } else if (firstDigit === '3') {
        stateName = 'Gujarat';
      } else {
        stateName = 'Delhi';
      }
    }

    const cleanState = (stateName || '').toLowerCase().replace(/\s+/g, '');
    let ratePerKg = 150;
    if (cleanState.includes('tamilnadu') || cleanState === 'tn') {
      ratePerKg = 50;
    }

    // Check if free shipping is active
    let freeShippingActive = false;
    try {
      const config = await Settings.findOne({ key: 'freeShipping' });
      if (config && config.value && config.value.status === 'ON') {
        const today = new Date().toISOString().split('T')[0];
        const { startDate, endDate } = config.value;
        let dateInRange = true;
        if (startDate && today < startDate) dateInRange = false;
        if (endDate && today > endDate) dateInRange = false;
        if (dateInRange) freeShippingActive = true;
      }
    } catch (settingsErr) {
      console.error('Error fetching settings for free shipping:', settingsErr.message);
    }

    const computedCourierCharge = Math.max(1, Math.ceil(totalWeight)) * ratePerKg;
    const finalCourierCharge = freeShippingActive ? 0 : computedCourierCharge;
    const packingVal = 59; // Enforced Packing charge of ₹59
    const finalTotalAmount = subtotalAmount + finalCourierCharge + packingVal;

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
      courierService: 'Standard Shipping',
      deliveryCharge: finalCourierCharge,
      packingCharge: packingVal,
      customOrderId,
      isDirectBuy: isDirectBuy || false
    };

    // If Payment Method is UPI-QR
    if (paymentMethod === 'UPI-QR') {
      orderData.paymentStatus = 'pending';
      orderData.qrPaymentExpiresAt = new Date(Date.now() + 300 * 1000); // 5 minutes active window

      // Calculate dealerPayoutDetails before creating order
      const dealerGroupAmount = {};
      for (const item of orderItems) {
        const did = item.dealerId.toString();
        dealerGroupAmount[did] = (dealerGroupAmount[did] || 0) + (item.price * item.quantity);
      }

      const dealerPayoutDetails = [];
      for (const did of Object.keys(dealerGroupAmount)) {
        const totalAmount = dealerGroupAmount[did];
        const packingCharge = packingVal; // default 59
        const totalDealerDue = totalAmount + packingCharge;
        const initialPaid20 = totalDealerDue * 0.20;
        const remainingDue80 = totalDealerDue * 0.80;

        dealerPayoutDetails.push({
          dealerId: did,
          totalAmount,
          packingCharge,
          initialPaid20,
          remainingDue80,
          status: 'Pending'
        });
      }
      orderData.dealerPayoutDetails = dealerPayoutDetails;

      const order = await Order.create(orderData);

      // 1. Send SMS to Admin with full customer name and address (Deferred for UPI-QR)
      if (paymentMethod !== 'UPI-QR') {
        const adminSmsMessage = `TENAQUARIUM: New Order #${order._id.toString().slice(-6)} of Rs ${finalTotalAmount} placed. Cust: ${shippingAddress.name}. Ph: ${shippingAddress.phone}. Addr: ${shippingAddress.address}, ${shippingAddress.city}, ${shippingAddress.state} - ${shippingAddress.zip}`;
        sendSMS(adminSmsMessage).catch(err => {
          console.error('Error sending admin order placement SMS:', err.message);
        });

        // Send 20% payout SMS to Admin
        for (const payout of order.dealerPayoutDetails) {
          try {
            const User = mongoose.model('User');
            const dealerUser = await User.findById(payout.dealerId);
            const dealerName = dealerUser ? dealerUser.name : 'Dealer';
            const adminPayoutSms = `TENAQUARIUM Payout: Order #${order._id.toString().slice(-6)} placed. 20% Initial Payout due to Dealer ${dealerName}: Rs ${payout.initialPaid20.toFixed(0)} (Total Due: Rs ${(payout.totalAmount + payout.packingCharge).toFixed(0)}). Remaining 80%: Rs ${payout.remainingDue80.toFixed(0)}. Please pay immediately!`;
            sendSMS(adminPayoutSms).catch(err => console.error('Error sending payout SMS:', err.message));
          } catch (payoutErr) {
            console.error('Error querying dealer user for SMS:', payoutErr.message);
          }
        }
      }

      // 2. Group items by dealerId and email each dealer with customer details
      try {
        const User = mongoose.model('User');
        
        // Group items by dealerId
        const dealerGroup = {};
        for (const item of orderItems) {
          const did = item.dealerId.toString();
          if (!dealerGroup[did]) dealerGroup[did] = [];
          
          // Get product name
          const productObj = await Product.findById(item.productId);
          const productName = productObj ? productObj.productName : 'Aquarium Product';
          
          dealerGroup[did].push({
            productName,
            color: item.color,
            quantity: item.quantity,
            price: item.price
          });
        }

        // Send email to each dealer
        const { sendDealerNewOrderEmail } = require('../utils/mail');
        for (const did of Object.keys(dealerGroup)) {
          const dealerUser = await User.findById(did);
          if (dealerUser && dealerUser.email) {
            sendDealerNewOrderEmail(order, dealerUser.email, dealerGroup[did]).catch(err => {
              console.error(`Error emailing dealer ${dealerUser.email}:`, err.message);
            });
          }
        }
      } catch (dealerEmailErr) {
        console.error('Failed to notify dealers via email:', dealerEmailErr.message);
      }

            

            const User = mongoose.model('User');
      const admins = await User.find({ role: 'admin' });
      for (const admin of admins) {
        
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

    // Perform Heuristic Verification on paymentProofImage if present
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
    }

    if (customerUpiId) order.customerUpiId = customerUpiId;
    if (paymentProofImage) order.paymentProofImage = paymentProofImage;
    await order.save();

    // Create database notification for admins
    const User = mongoose.model('User');
    const admins = await User.find({ role: 'admin' });
    for (const admin of admins) {
      
    }

    // Send real urgent SMS notification to Admin in the background
    const baseUrl = 'https://www.tenaquarium.com';
    const smsMessage = `TENAQUARIUM: Verify payment of ₹${order.totalAmount.toFixed(0)} for Order #${order._id.toString().slice(-6)}: Received or Not? Click: ${baseUrl}/api/orders/a/${order._id}`;
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
            for (const order of expiredOrders) {
        order.paymentStatus = 'failed';
        order.orderStatus = 'Cancelled';
        await order.save();

                
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
      customerId: req.user._id
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
    // Find all orders where at least one product belongs to this dealer immediately upon placement
    const orders = await Order.find({
      'products.dealerId': req.user._id
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
        accountHolderName: req.body.cancellationDetails.accountHolderName || '',
        cancelledBy: 'customer',
        needBankDetails: false,
        requestedAt: req.body.cancellationDetails.requestedAt || new Date(),
        refundPercentage: percentage,
        refundAmount: amount,
        cancellationReason: reason
      };
    } else if (orderStatus === 'Cancelled') {
      order.cancellationDetails = {
        requestedAt: new Date(),
        refundPercentage: 100,
        refundAmount: order.totalAmount,
        cancellationReason: req.body.cancellationReason || `Cancelled by ${req.user.role}`,
        cancelledBy: req.user.role,
        needBankDetails: order.paymentMethod === 'UPI-QR'
      };
      
      // Send secure link email to customer ONLY IF they paid via UPI
      if (order.paymentMethod === 'UPI-QR') {
        try {
          const populatedOrderForMail = await Order.findById(order._id).populate('customerId');
          if (populatedOrderForMail && populatedOrderForMail.customerId && populatedOrderForMail.customerId.email) {
            const { sendCustomerRefundBankLinkEmail } = require('../utils/mail');
            sendCustomerRefundBankLinkEmail(order, populatedOrderForMail.customerId.email).catch(err => {
              console.error('Error sending refund bank link email:', err.message);
            });
          }
        } catch (mailErr) {
          console.error('Error querying customer for refund bank link email:', mailErr.message);
        }
      }

      // Send cancellation SMS with secure refund registry link to customer
      try {
        const customerPhone = order.shippingAddress?.phone;
        if (customerPhone) {
          const cleanCustomerPhone = customerPhone.startsWith('+') ? customerPhone : `+91${customerPhone}`;
          let smsText = `TENAQUARIUM: Your Order #${order._id.toString().slice(-6)} has been cancelled.`;
          if (order.paymentMethod === 'UPI-QR') {
            smsText += ` Please submit your bank details securely for a 100% refund: https://www.tenaquarium.com/#/refund-bank-details/${order._id}`;
          } else {
            smsText += ` No further action is required. Thank you!`;
          }
          sendSMS(smsText, cleanCustomerPhone).catch(err => {
            console.error('Error sending customer cancellation SMS:', err.message);
          });
        }
      } catch (smsErr) {
        console.error('Error triggering customer cancellation SMS:', smsErr.message);
      }
    }

    // Send status change email notifications to the customer
    if (orderStatus && orderStatus !== prevOrderStatus) {
      const populatedOrderForMail = await Order.findById(order._id).populate('customerId');
      if (populatedOrderForMail && populatedOrderForMail.customerId && populatedOrderForMail.customerId.email) {
        const { sendStatusEmail } = require('../utils/mail');
        sendStatusEmail(order, populatedOrderForMail.customerId.email, orderStatus).catch(err => {
          console.error('Error sending status update email:', err.message);
        });
      }
    }

    // Restore stock if cancelled
    if (orderStatus === 'Cancelled' && prevOrderStatus !== 'Cancelled') {
      // Only restore if stock was actually deducted (COD order, or paid UPI order)
      if (order.paymentMethod === 'COD' || prevPaymentStatus === 'paid') {
        for (const item of order.products) {
          await restoreProductStock(item.productId, item.color, item.quantity);
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

    // Send admin SMS notification on courier dispatch
    if ((orderStatus === 'Courier Dispatched' || orderStatus === 'Shipped') && prevOrderStatus !== 'Courier Dispatched' && prevOrderStatus !== 'Shipped') {
      try {
        const User = mongoose.model('User');
        const dealerId = req.user._id;
        const dealerUser = await User.findById(dealerId);
        const dealerName = dealerUser ? dealerUser.name : 'Dealer';

        const payout = order.dealerPayoutDetails.find(p => p.dealerId.toString() === dealerId.toString());
        if (payout) {
          const adminSmsText = `TENAQUARIUM Dispatch: Order #${order._id.toString().slice(-6)} has been dispatched by Dealer ${dealerName}. Initial 20% Paid: Rs ${payout.initialPaid20.toFixed(0)}. Remaining 80% due now: Rs ${payout.remainingDue80.toFixed(0)}. Packing charge: Rs ${payout.packingCharge.toFixed(0)}. Please settle payment!`;
          sendSMS(adminSmsText).catch(err => console.error('Error sending dispatch SMS to admin:', err.message));
        }
      } catch (smsErr) {
        console.error('Failed to send admin dispatch SMS:', smsErr.message);
      }
    }

    const updatedOrder = await order.save();

    // Send customer order confirmation SMS if payment is approved now
    if (paymentStatus === 'paid' && prevPaymentStatus !== 'paid') {
      try {
        if (!order.isDirectBuy) {
          await Cart.findOneAndUpdate({ customerId: order.customerId }, { products: [] });
        }
      } catch (cartErr) {
        console.error('Error clearing cart in updateOrderStatus:', cartErr.message);
      }
      // Deduct stock upon payment approval
      for (const item of order.products) {
        await deductProductStock(item.productId, item.color, item.quantity);
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

      if (order.paymentMethod === 'UPI-QR') {
        sendPayoutAndPlacementSMS(order).catch((payoutErr) => {
          console.error('Error sending deferred payout/placement SMS from updateOrderStatus:', payoutErr.message);
        });
      }
    }

        if (orderStatus === 'Delivered') {
      try {
        for (const item of order.products) {
          const productObj = await Product.findById(item.productId);
          const name = productObj ? productObj.productName : 'your product';
          
        }
      } catch (err) {
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
    if (order.paymentDetails) {
      order.paymentDetails.status = 'SUCCESS';
      order.paymentDetails.paidAt = new Date();
    }
    await order.save();

    // Instant SSE push to customer's open checkout window (< 10ms)
    try {
      const { notifyPaymentClients } = require('./paymentController');
      notifyPaymentClients(order._id, {
        type: 'PAYMENT_VERIFIED',
        isPaid: true,
        paymentStatus: 'PAID',
        orderStatus: 'PLACED',
        orderId: order._id,
        customOrderId: order.customOrderId || order._id.toString().slice(-6),
        totalAmount: order.totalAmount,
        amount: order.totalAmount,
        paidAt: new Date()
      });
    } catch (e) {
      console.warn('SSE client notification failed:', e.message);
    }

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
    for (const item of order.products || []) {
      if (item.productId) {
        await deductProductStock(item.productId, item.color, item.quantity);
      }
    }

    // Clear customer cart
    try {
      if (!order.isDirectBuy && order.customerId) {
        await Cart.findOneAndUpdate({ customerId: order.customerId }, { products: [] });
      }
    } catch (cartErr) {
      console.error('Error clearing cart in approveOrderSMS:', cartErr.message);
    }

    // Send customer order confirmation SMS in the background
    const customerPhone = order.shippingAddress?.phone || order.customerId?.phone;
    if (customerPhone) {
      const cleanCustomerPhone = customerPhone.startsWith('+') ? customerPhone : `+91${customerPhone}`;
      const customerSmsMessage = `Tenaq: Ord #${order._id.toString().slice(-6)} (₹${order.totalAmount.toFixed(0)}) placed successfully! Shipped via ${order.courierService || 'Standard Courier'}.`;
      sendSMS(customerSmsMessage, cleanCustomerPhone).catch((smsErr) => {
        console.error('Error sending customer order SMS:', smsErr.message);
      });
    }

    if (order.paymentMethod === 'UPI-QR') {
      sendPayoutAndPlacementSMS(order).catch((payoutErr) => {
        console.error('Error sending deferred payout/placement SMS from approveOrderSMS:', payoutErr.message);
      });
    }

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Order Approved - TEN Aquarium</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; padding: 40px 20px; background-color: #f0fdf4; color: #166534; margin: 0; }
            .card { max-width: 440px; margin: 40px auto; background: white; padding: 36px 24px; border-radius: 20px; box-shadow: 0 10px 25px rgba(22, 101, 52, 0.1); border: 1.5px solid #86efac; }
            h1 { font-size: 26px; margin-bottom: 12px; color: #15803d; font-weight: 800; }
            p { font-size: 15px; color: #166534; line-height: 1.5; margin: 0 0 10px; }
            .badge { display: inline-block; background: #dcfce7; color: #166534; font-weight: 800; padding: 6px 14px; border-radius: 20px; font-size: 14px; margin-bottom: 16px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="badge">✓ Payment Confirmed</div>
            <h1>Order Approved Successfully</h1>
            <p>Order <strong>#${order.customOrderId || order._id.toString().slice(-6)}</strong> is now marked as <strong>PAID</strong>.</p>
            <p>The customer's screen has automatically updated to <strong>Order Placed Successfully</strong>.</p>
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

    order.paymentStatus = 'failed';
    order.orderStatus = 'Cancelled';
    if (order.paymentDetails) {
      order.paymentDetails.status = 'FAILED';
    }
    await order.save();

    // Instant SSE push to customer's open checkout window (< 10ms)
    try {
      const { notifyPaymentClients } = require('./paymentController');
      notifyPaymentClients(order._id, {
        type: 'PAYMENT_REJECTED',
        isPaid: false,
        paymentStatus: 'failed',
        orderStatus: 'Cancelled',
        orderId: order._id,
        customOrderId: order.customOrderId || order._id.toString().slice(-6),
        reason: 'Payment was not received in merchant bank account'
      });
    } catch (e) {
      console.warn('SSE client notification failed:', e.message);
    }

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Order Rejected - TEN Aquarium</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; padding: 40px 20px; background-color: #fef2f2; color: #991b1b; margin: 0; }
            .card { max-width: 440px; margin: 40px auto; background: white; padding: 36px 24px; border-radius: 20px; box-shadow: 0 10px 25px rgba(153, 27, 27, 0.1); border: 1.5px solid #fca5a5; }
            h1 { font-size: 26px; margin-bottom: 12px; color: #dc2626; font-weight: 800; }
            p { font-size: 15px; color: #991b1b; line-height: 1.5; margin: 0 0 10px; }
            .badge { display: inline-block; background: #fee2e2; color: #991b1b; font-weight: 800; padding: 6px 14px; border-radius: 20px; font-size: 14px; margin-bottom: 16px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="badge">✗ Payment Not Received</div>
            <h1>Order Rejected & Cancelled</h1>
            <p>Order <strong>#${order.customOrderId || order._id.toString().slice(-6)}</strong> has been marked as <strong>CANCELLED</strong>.</p>
            <p>The customer's screen has been notified with complaint and support contact details.</p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(`<h1>Server Error</h1><p>${error.message}</p>`);
  }
};

// @desc    Customer notifies they completed payment via UPI QR
// @route   POST /api/orders/:id/claim-payment
// @access  Private/Customer
const claimPayment = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    order.paymentDetails = {
      ...(order.paymentDetails || {}),
      status: 'AWAITING_ADMIN_VERIFICATION',
      claimedAt: new Date()
    };
    await order.save();

    const shortId = order.customOrderId || order._id.toString().slice(-6);
    const amountStr = order.totalAmount.toFixed(0);
    const baseUrl = process.env.SMS_REDIRECT_BASE_URL || 'https://www.tenaquarium.com';
    const actionUrl = `${baseUrl}/api/orders/a/${order._id}`;

    // 0. Instant Admin Real-Time SSE Push (< 5ms) to all connected Admin screens/apps
    try {
      const { notifyAdminClients } = require('./paymentController');
      notifyAdminClients({
        type: 'PAYMENT_CLAIMED',
        orderId: order._id,
        shortId,
        amount: order.totalAmount,
        customerName: order.shippingAddress?.name || 'Customer',
        customerPhone: order.shippingAddress?.phone || '',
        paymentProofImage: order.paymentProofImage || null,
        timestamp: Date.now()
      });
    } catch (sseErr) {
      console.warn('Admin SSE broadcast notice:', sseErr.message);
    }

    // Send instant SMS to Admin phone within 1 second
    const adminSms = `TENAQUARIUM ALERT: Customer claims Rs ${amountStr} paid for Order #${shortId}. Check your bank and confirm: ${actionUrl}`;
    sendSMS(adminSms).catch((err) => {
      console.warn('Admin claim payment SMS notification failed:', err.message);
    });

    // Send instant Email alert to Admin phone via verified Gmail SMTP (< 500ms)
    try {
      const nodemailer = require('nodemailer');
      if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: process.env.SMTP_PORT || 587,
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });
        transporter.sendMail({
          from: `"TEN Aquarium Orders" <${process.env.SMTP_USER}>`,
          to: process.env.SMTP_USER,
          subject: `⚡ URGENT PAYMENT ALERT: Order #${shortId} (₹${amountStr})`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; max-width: 440px; border: 1.5px solid #0284c7; border-radius: 16px; background: #ffffff;">
              <h2 style="color: #0369a1; margin-top: 0; font-size: 20px;">Customer Claims UPI Payment</h2>
              <p style="font-size: 15px; color: #334155; line-height: 1.5;">Customer claims payment of <strong style="color: #059669; font-size: 17px;">₹${amountStr}</strong> for <strong>Order #${shortId}</strong>.</p>
              <p style="font-size: 14px; color: #64748b;">Please check your SBI / Google Pay app, then tap below:</p>
              <div style="text-align: center; margin: 24px 0;">
                <a href="${actionUrl}" style="background: #0284c7; color: white; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);">
                  Open Verification Page (YES / NO)
                </a>
              </div>
              <p style="font-size: 12px; color: #94a3b8; word-break: break-all;">Direct link: ${actionUrl}</p>
            </div>
          `
        }).then(() => {
          console.log(`[ALERT EMAIL SENT] Sent instant payment claim notification to ${process.env.SMTP_USER}`);
        }).catch(e => console.warn('Admin payment claim email notification failed:', e.message));
      }
    } catch (mailErr) {
      console.warn('Mail dispatch error:', mailErr.message);
    }

    console.log(`[CLAIM PAYMENT] Customer notified payment completed for Order #${shortId}. Action URL: ${actionUrl}`);

    res.json({
      success: true,
      message: 'Merchant notified. Awaiting bank verification.',
      orderId: order._id,
      customOrderId: shortId
    });
  } catch (error) {
    console.error('Error in claimPayment:', error.message);
    res.status(500).json({ success: false, message: error.message });
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

    const shortId = order.customOrderId || order._id.toString().slice(-6);
    const amount = order.totalAmount.toLocaleString();
    const upiId = order.customerUpiId || 'Direct UPI QR Scan';

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>TEN Aquarium - Payment Verification</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f8fafc; padding: 20px; text-align: center; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
          .card { max-width: 420px; width: 100%; background: white; padding: 32px 24px; border-radius: 24px; box-shadow: 0 10px 30px rgba(2, 132, 199, 0.08); border: 1.5px solid #e2e8f0; box-sizing: border-box; }
          .badge { display: inline-block; background: #e0f2fe; color: #0369a1; font-weight: 800; padding: 6px 14px; border-radius: 20px; font-size: 13px; margin-bottom: 14px; }
          h1 { font-size: 22px; color: #1e3a8a; margin-top: 0; margin-bottom: 16px; font-weight: 800; }
          .details { background: #f8fafc; padding: 18px; border-radius: 16px; font-size: 15px; text-align: left; margin-bottom: 24px; border: 1px solid #cbd5e1; }
          .details div { margin-bottom: 10px; color: #334155; }
          .details div:last-child { margin-bottom: 0; }
          .question { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 18px; padding: 12px; background: #fef9c3; border: 1px solid #fde047; border-radius: 12px; }
          .btn { display: block; width: 100%; padding: 16px; margin-bottom: 12px; border: none; border-radius: 14px; font-size: 16px; font-weight: bold; cursor: pointer; transition: transform 0.1s, opacity 0.2s; box-sizing: border-box; }
          .btn:active { transform: scale(0.98); }
          .btn-approve { background: #10b981; color: white; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3); }
          .btn-reject { background: #ef4444; color: white; box-shadow: 0 4px 14px rgba(239, 68, 68, 0.25); }
          .btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
          .status-msg { display: none; font-size: 17px; font-weight: bold; margin-top: 20px; animation: popIn 0.3s ease-out; }
          @keyframes popIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">Merchant Payment Check</div>
          <h1>Verify Customer Payment</h1>
          
          <div class="details">
            <div>Order ID: <strong>#${shortId}</strong></div>
            <div>Expected Amount: <strong style="color: #059669; font-size: 19px;">₹${amount}</strong></div>
            <div>Beneficiary: <strong>tenaquarium457@oksbi (SBI)</strong></div>
          </div>
          
          ${order.paymentProofImage ? `
          <div style="margin-top: 15px; margin-bottom: 20px; text-align: left;">
            <div style="font-weight: bold; font-size: 13px; margin-bottom: 8px; color: #1e3a8a;">Uploaded Payment Proof:</div>
            <img src="${order.paymentProofImage}" style="max-width: 100%; max-height: 380px; border-radius: 12px; border: 1.5px solid #cbd5e1; box-shadow: 0 4px 12px rgba(0,0,0,0.15); object-fit: contain; display: block; margin: 0 auto;" alt="Payment Proof" />
          </div>
          ` : ''}

          <div class="question">
            Did you receive ₹${amount} in your SBI / Google Pay account?
          </div>
          
          <button class="btn btn-approve" onclick="submitAction('approve')">✓ YES - Payment Received</button>
          <button class="btn btn-reject" onclick="submitAction('reject')">✗ NO - Payment Not Received</button>
          
          <div id="status" class="status-msg"></div>
        </div>

        <script>
          async function submitAction(action) {
            const statusDiv = document.getElementById('status');
            statusDiv.style.display = 'block';
            statusDiv.innerHTML = 'Updating order status...';
            statusDiv.style.color = '#475569';

            try {
              const res = await fetch('/api/orders/' + (action === 'approve' ? 'approve-sms' : 'reject-sms') + '/${order._id}');
              if (res.ok) {
                if (action === 'approve') {
                  statusDiv.innerHTML = '✓ Payment Confirmed! Customer notified.';
                  statusDiv.style.color = '#10b981';
                } else {
                  statusDiv.innerHTML = '✗ Order Cancelled. Customer notified with complaint details.';
                  statusDiv.style.color = '#ef4444';
                }
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

// @desc    Submit bank details for a refund on cancelled order
// @route   PUT /api/orders/:id/refund-bank-details
// @access  Private/Customer
const submitRefundBankDetails = async (req, res) => {
  const { bankName, accountNumber, ifscCode, accountHolderName } = req.body;

  if (!bankName || !accountNumber || !ifscCode || !accountHolderName) {
    return res.status(400).json({ message: 'All bank details are required.' });
  }

  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    // Verify owner
    if (order.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to submit bank details for this order.' });
    }

    if (order.orderStatus !== 'Cancelled') {
      return res.status(400).json({ message: 'Bank details can only be submitted for cancelled orders.' });
    }

    order.cancellationDetails.bankName = bankName;
    order.cancellationDetails.accountNumber = accountNumber;
    order.cancellationDetails.ifscCode = ifscCode;
    order.cancellationDetails.accountHolderName = accountHolderName;
    order.cancellationDetails.needBankDetails = false;
    order.cancellationDetails.requestedAt = new Date();

    const savedOrder = await order.save();

    // Populate customer and products for email & SMS
    const populatedOrder = await Order.findById(order._id)
      .populate('customerId')
      .populate('products.productId');

    // 1. Send SMS to Admin
    const productSummary = populatedOrder.products.map(p => `${p.productId?.productName || 'Product'} x ${p.quantity}`).join(', ');
    const adminSmsMessage = `TENAQUARIUM Refund: Order #${order._id.toString().slice(-6)}. Amt: Rs ${order.cancellationDetails.refundAmount.toFixed(0)}. Cust: ${order.shippingAddress.name} (${order.shippingAddress.phone}). Items: [${productSummary}]. Bank: ${accountHolderName} | ${bankName} | Acc: ${accountNumber} | IFSC: ${ifscCode}. Addr: ${order.shippingAddress.address}, ${order.shippingAddress.city}. Reason: ${order.cancellationDetails.cancellationReason || 'Cancelled'}.`;
    
    sendSMS(adminSmsMessage).catch(err => {
      console.error('Error sending admin refund SMS:', err.message);
    });

    // 2. Send email to Admin
    const { sendAdminRefundNotificationEmail } = require('../utils/mail');
    sendAdminRefundNotificationEmail(populatedOrder).catch(err => {
      console.error('Error sending admin refund email:', err.message);
    });

    res.json({
      success: true,
      message: 'Bank details submitted successfully. Admin has been notified for refund processing.',
      order: savedOrder
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const sendPayoutAndPlacementSMS = async (order) => {
  // Send order placement SMS to admin (since it was deferred for UPI-QR)
  if (order.paymentMethod === 'UPI-QR') {
    const adminSmsMessage = `TENAQUARIUM: Paid Order #${order._id.toString().slice(-6)} of Rs ${order.totalAmount} placed & verified. Cust: ${order.shippingAddress.name}. Ph: ${order.shippingAddress.phone}. Addr: ${order.shippingAddress.address}, ${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.zip}`;
    sendSMS(adminSmsMessage).catch(err => {
      console.error('Error sending admin paid order SMS:', err.message);
    });
  }

  // Send 20% payout SMS to Admin
  for (const payout of order.dealerPayoutDetails) {
    try {
      const User = mongoose.model('User');
      const dealerUser = await User.findById(payout.dealerId);
      const dealerName = dealerUser ? dealerUser.name : 'Dealer';
      const adminPayoutSms = `TENAQUARIUM Payout: Order #${order._id.toString().slice(-6)} placed. 20% Initial Payout due to Dealer ${dealerName}: Rs ${payout.initialPaid20.toFixed(0)} (Total Due: Rs ${(payout.totalAmount + payout.packingCharge).toFixed(0)}). Remaining 80%: Rs ${payout.remainingDue80.toFixed(0)}. Please pay immediately!`;
      sendSMS(adminPayoutSms).catch(err => console.error('Error sending payout SMS:', err.message));
    } catch (payoutErr) {
      console.error('Error querying dealer user for SMS:', payoutErr.message);
    }
  }
};

// @desc    Validate customer uploaded payment screenshot
// @route   POST /api/orders/:id/validate-screenshot
// @access  Private/Customer
const validateScreenshot = async (req, res) => {
  const { paymentProofImage } = req.body;
  if (!paymentProofImage) {
    return res.status(400).json({ success: false, message: 'No screenshot image provided' });
  }

  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (!paymentProofImage.startsWith('data:image/')) {
      return res.status(400).json({ success: false, message: 'Invalid file format. Please upload a valid image screenshot.' });
    }

    // Convert Base64 image to Buffer
    const base64Data = paymentProofImage.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, 'base64');

    if (imageBuffer.length < 5000) {
      return res.status(400).json({ success: false, message: 'Uploaded file is too small to be a valid screenshot receipt.' });
    }

    // Perform OCR using local eng.traineddata
    const worker = await createWorker('eng', 1, {
      langPath: path.join(__dirname, '..'),
      gzip: false,
    });
    const { data: { text } } = await worker.recognize(imageBuffer);
    await worker.terminate();

    const lowerText = text.toLowerCase();
    const cleanedText = lowerText.replace(/[^a-z0-9]/g, '');

    // 1. Payee Name Check
    const hasPayee = lowerText.includes('ten aquarium') || 
                      lowerText.includes('elavarasi') || 
                      lowerText.includes('tenaquarium457') ||
                      cleanedText.includes('tenaquarium') ||
                      cleanedText.includes('elavarasi') ||
                      cleanedText.includes('tenaquarium457');

    // 2. Amount Check
    const amountVal = order.totalAmount;
    const amtStr = amountVal.toString();
    const amtDecimal = amountVal.toFixed(2);
    const amtComma = amountVal.toLocaleString('en-IN');

    const hasAmount = lowerText.includes(amtStr) || 
                      lowerText.includes(amtComma) || 
                      lowerText.includes(amtDecimal) ||
                      cleanedText.includes(amtStr.replace(/[^0-9]/g, '')) ||
                      cleanedText.includes(amtDecimal.replace(/[^0-9]/g, ''));

    // Helpers to generate dates and times
    const generateDates = (d) => {
      const dd = d.getDate().toString().padStart(2, '0');
      const d_single = d.getDate().toString();
      const mm = (d.getMonth() + 1).toString().padStart(2, '0');
      const m_single = (d.getMonth() + 1).toString();
      const yyyy = d.getFullYear().toString();
      const yy = yyyy.slice(-2);
      
      const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const fullMonths = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      const mmm = months[d.getMonth()];
      const mmmm = fullMonths[d.getMonth()];

      return [
        `${dd}-${mm}-${yyyy}`,
        `${dd}/${mm}/${yyyy}`,
        `${dd}-${mm}-${yy}`,
        `${dd}/${mm}/${yy}`,
        `${d_single}-${m_single}-${yyyy}`,
        `${d_single}/${m_single}/${yyyy}`,
        `${d_single}-${m_single}-${yy}`,
        `${d_single}/${m_single}/${yy}`,
        `${dd} ${mmm} ${yyyy}`,
        `${d_single} ${mmm} ${yyyy}`,
        `${dd} ${mmmm} ${yyyy}`,
        `${d_single} ${mmmm} ${yyyy}`,
        `${mmm} ${dd}, ${yyyy}`,
        `${mmmm} ${dd}, ${yyyy}`,
        `${dd} ${mmm}`,
        `${mmm} ${dd}`,
        `${yyyy}-${mm}-${dd}`
      ];
    };

    const generateTimes = (nowTime, minutesRange = 30) => {
      const timeStrings = [];
      for (let i = 0; i <= minutesRange; i++) {
        const t = new Date(nowTime.getTime() - i * 60 * 1000);
        const hh = t.getHours().toString().padStart(2, '0');
        const mm = t.getMinutes().toString().padStart(2, '0');
        timeStrings.push(`${hh}:${mm}`);

        let h12 = t.getHours() % 12;
        h12 = h12 ? h12 : 12;
        const mm12 = t.getMinutes().toString().padStart(2, '0');
        const ampm = t.getHours() >= 12 ? 'pm' : 'am';

        timeStrings.push(`${h12}:${mm12}`);
        timeStrings.push(`${h12}:${mm12} ${ampm}`);
        timeStrings.push(`${h12}:${mm12}${ampm}`);
      }
      return timeStrings;
    };

    // 3. Date Check
    const dateStrings = [];
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    dateStrings.push(...generateDates(today));
    dateStrings.push(...generateDates(yesterday));

    const hasDate = dateStrings.some(dStr => {
      const cleanedDStr = dStr.replace(/[^a-z0-9]/g, '');
      return lowerText.includes(dStr) || (cleanedDStr && cleanedText.includes(cleanedDStr));
    });

    // 4. Time Check
    const timeStrings = [];
    const nowTime = new Date();
    timeStrings.push(...generateTimes(nowTime, 30));

    const hasTime = timeStrings.some(tStr => {
      const cleanedTStr = tStr.replace(/[^a-z0-9]/g, '');
      return lowerText.includes(tStr) || (cleanedTStr && cleanedText.includes(cleanedTStr));
    });

    const isValid = hasPayee && hasAmount && hasDate && hasTime;

    return res.json({
      success: isValid,
      message: isValid ? 'Screenshot validated successfully!' : 'Verification failed: Some fields could not be matched.',
      errors: {
        payee: !hasPayee,
        amount: !hasAmount,
        date: !hasDate,
        time: !hasTime
      },
      extractedText: text
    });

  } catch (error) {
    console.error('Error during screenshot OCR validation:', error);
    res.status(500).json({ success: false, message: error.message });
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
  submitRefundBankDetails,
  validateScreenshot,
  claimPayment,
};
