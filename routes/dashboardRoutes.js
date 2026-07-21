const express = require('express');
const router = express.Router();
const { getAdminStats, getDealerStats } = require('../controllers/dashboardController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.get('/admin', protect, authorize('admin'), getAdminStats);
router.get('/dealer', protect, authorize('dealer'), getDealerStats);

module.exports = router;
