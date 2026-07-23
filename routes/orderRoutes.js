const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/orderController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/')
  .post(protect, authorize('customer', 'dealer'), createOrder)
  .get(protect, authorize('admin'), getAllOrders);

router.get('/myorders', protect, authorize('customer', 'dealer'), getMyOrders);
router.get('/dealer', protect, authorize('dealer'), getDealerOrders);

router.get('/approve-sms/:id', approveOrderSMS);
router.get('/reject-sms/:id', rejectOrderSMS);
router.get('/a/:id', actionOrderSMS);

router.route('/:id')
  .get(protect, getOrderById)
  .put(protect, authorize('customer', 'dealer', 'admin'), updateOrderStatus);

router.put('/:id/payment-proof', protect, authorize('customer', 'dealer'), submitPaymentProof);
router.put('/:id/refund-complete', protect, authorize('admin'), markRefundCompleted);
router.put('/:id/dealer-payout', protect, authorize('admin'), updateDealerPayoutStatus);
router.get('/public-track/:id', getPublicTracking);

module.exports = router;
