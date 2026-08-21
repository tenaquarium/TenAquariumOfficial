const express = require('express');
const router = express.Router();
const {
  calculateRates,
  getAllRates,
  upsertRate,
  deleteRate,
  
  checkAvailability
} = require('../controllers/courierController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Public Routes
router.post('/calculate', calculateRates);
router.post('/check-availability', checkAvailability);

// Admin-Only Routes
router.use(protect);
router.use(authorize('admin'));

router.route('/rates')
  .get(getAllRates)
  .post(upsertRate);

router.delete('/rates/:id', deleteRate);


module.exports = router;
