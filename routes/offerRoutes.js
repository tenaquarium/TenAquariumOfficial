const express = require('express');
const router = express.Router();
const {
  createOffer,
  getDealerOffers,
  getCustomersList,
  getOfferById,
  updateOffer,
  deleteOffer,
  duplicateOffer,
  getAdminOffers,
  approveOffer,
  rejectOffer,
  getActiveOffers,
} = require('../controllers/offerController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Public routes
router.get('/active', getActiveOffers);

// Protected routes (Both Admin & Dealer)
router.get('/customers', protect, authorize('dealer', 'admin'), getCustomersList);

// Dealer-specific routes
router.get('/dealer', protect, authorize('dealer'), getDealerOffers);
router.post('/', protect, authorize('dealer'), createOffer);
router.put('/:id', protect, authorize('dealer'), updateOffer);
router.delete('/:id', protect, authorize('dealer'), deleteOffer);
router.post('/:id/duplicate', protect, authorize('dealer'), duplicateOffer);

// Admin-specific routes
router.get('/admin', protect, authorize('admin'), getAdminOffers);
router.post('/:id/approve', protect, authorize('admin'), approveOffer);
router.post('/:id/reject', protect, authorize('admin'), rejectOffer);

// Common detail route
router.get('/:id', protect, authorize('dealer', 'admin'), getOfferById);

module.exports = router;
