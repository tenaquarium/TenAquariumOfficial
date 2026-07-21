const express = require('express');
const router = express.Router();
const {
  getDealers,
  updateDealerApproval,
  editDealerAdmin,
  deleteDealerAdmin,
  getPublicDealerProfile,
  getApprovedDealersPublic,
} = require('../controllers/dealerController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Public endpoints
router.get('/approved/public', getApprovedDealersPublic);
router.get('/:id/public', getPublicDealerProfile);

// All subsequent routes require Admin authorization
router.use(protect, authorize('admin'));

router.route('/')
  .get(getDealers);

router.route('/:id')
  .put(editDealerAdmin)
  .delete(deleteDealerAdmin);

router.put('/:id/approval', updateDealerApproval);

module.exports = router;
