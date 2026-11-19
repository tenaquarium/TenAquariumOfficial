const express = require('express');
const router = express.Router();
const {
  getUpiPaymentDetails,
  getPaymentStatus,
  handlePaymentWebhook,
  streamPaymentStatus,
  streamAdminPaymentAlerts,
  sandboxVerifyPayment,
  handleUpiAppNotification,
} = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');

// Get dynamic UPI payload for order
router.get('/details/:orderId', protect, getUpiPaymentDetails);

// Real-Time Server-Sent Events (SSE) Stream (< 10ms instant push to frontend)
router.get('/stream/:orderId', streamPaymentStatus);

// Real-Time Admin SSE Stream for instant UPI payment claims (< 5ms)
router.get('/admin-stream', streamAdminPaymentAlerts);

// Real-time live payment status check (polling fallback)
router.get('/status/:orderId', getPaymentStatus);

// Authenticated Webhook endpoint from payment provider
router.post('/webhook', handlePaymentWebhook);

// Real-time UPI App Notification endpoint (Google Pay / PhonePe / Paytm push listener)
router.post('/upi-notification', handleUpiAppNotification);
router.get('/upi-notification', handleUpiAppNotification);

// Sandbox verification endpoint for testing
router.post('/sandbox-verify', protect, sandboxVerifyPayment);

module.exports = router;
