const express = require('express');
const router = express.Router();
const {
  registerCustomer,
  registerDealer,
  loginUser,
  getUserProfile,
  updateUserProfile,
  forgotPassword,
  resetPassword,
  sendOtp,
  checkEmailExist,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', registerCustomer);
router.post('/register-dealer', registerDealer);
router.post('/login', loginUser);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/send-otp', sendOtp);
router.post('/check-email', checkEmailExist);

router
  .route('/profile')
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile);

module.exports = router;
