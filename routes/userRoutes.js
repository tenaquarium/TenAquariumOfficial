const express = require('express');
const router = express.Router();
const {
  getCustomers,
  editCustomerAdmin,
  toggleCustomerBlock,
  deleteCustomerAdmin,
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All routes require Admin role authentication
router.use(protect, authorize('admin'));

router.route('/customers')
  .get(getCustomers);

router.route('/customers/:id')
  .put(editCustomerAdmin)
  .delete(deleteCustomerAdmin);

router.put('/customers/:id/block', toggleCustomerBlock);

module.exports = router;
