const express = require('express');
const router = express.Router();
const {
  getCart,
  addToCart,
  updateCartQuantity,
  removeFromCart,
  clearCart,
} = require('../controllers/cartController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All cart routes require customer or dealer role authentication
router.use(protect, authorize('customer', 'dealer'));

router
  .route('/')
  .get(getCart)
  .post(addToCart)
  .put(updateCartQuantity)
  .delete(clearCart);

router.delete('/:productId', removeFromCart);

module.exports = router;
