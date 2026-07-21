const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProductById,
  getDealerProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} = require('../controllers/productController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/')
  .get(getProducts)
  .post(protect, authorize('dealer'), createProduct);

router.get('/myproducts', protect, authorize('dealer'), getDealerProducts);

router.route('/:id')
  .get(getProductById)
  .put(protect, authorize('dealer'), updateProduct)
  .delete(protect, authorize('dealer', 'admin'), deleteProduct);

module.exports = router;
