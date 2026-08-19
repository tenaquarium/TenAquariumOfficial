const express = require('express');
const router = express.Router();
const {
  getFreeShippingConfig,
  updateFreeShippingConfig,
} = require('../controllers/settingsController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.get('/free-shipping', getFreeShippingConfig);
router.put('/free-shipping', protect, authorize('admin'), updateFreeShippingConfig);

module.exports = router;
