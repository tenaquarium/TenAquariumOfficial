const express = require('express');
const router = express.Router();
const {
  createReview,
  getProductReviews,
  getApprovedReviews,
  getAllReviewsAdmin,
  moderateReview,
  deleteReview,
  syncGoogleReviews,
  getDealerReviews,
  getMyReviews,
} = require('../controllers/reviewController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/')
  .post(protect, authorize('customer'), createReview)
  .get(protect, authorize('admin'), getAllReviewsAdmin);

router.get('/my-reviews', protect, authorize('customer'), getMyReviews);
router.get('/approved', getApprovedReviews);
router.get('/product/:productId', getProductReviews);
router.get('/dealer/:dealerId', getDealerReviews);

router.post('/sync', protect, authorize('dealer'), syncGoogleReviews);

router.put('/:id/moderate', protect, authorize('admin'), moderateReview);
router.delete('/:id', protect, authorize('customer', 'admin'), deleteReview);

module.exports = router;
