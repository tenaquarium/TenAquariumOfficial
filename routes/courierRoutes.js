const express = require('express');
const router = express.Router();
const {
  calculateRates,
  getAllRates,
  upsertRate,
  deleteRate,
  getAllZones,
  upsertZone,
  deleteZone,
} = require('../controllers/courierController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Public Route
router.post('/calculate', calculateRates);

// Admin-Only Routes
router.use(protect);
router.use(authorize('admin'));

router.route('/rates')
  .get(getAllRates)
  .post(upsertRate);

router.delete('/rates/:id', deleteRate);

router.route('/zones')
  .get(getAllZones)
  .post(upsertZone);

router.delete('/zones/:id', deleteZone);

module.exports = router;
