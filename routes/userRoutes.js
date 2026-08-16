const express = require('express');
const router = express.Router();
const {
  getCustomers,
  editCustomerAdmin,
  toggleCustomerBlock,
  deleteCustomerAdmin,
  getUserProfileById,
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Get generic profile info (accessible by any logged in user)
router.get('/profile/:id', protect, getUserProfileById);

// All subsequent routes require Admin role authentication
router.use(protect, authorize('admin'));

router.route('/customers')
  .get(getCustomers);

router.route('/customers/:id')
  .put(editCustomerAdmin)
  .delete(deleteCustomerAdmin);

router.put('/customers/:id/block', toggleCustomerBlock);

module.exports = router;
