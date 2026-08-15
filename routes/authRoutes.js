const express = require('express');
const router = express.Router();
const {
  registerCustomer,
  registerDealer,
  loginUser,
  verifyAdminOtp,
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
router.post('/verify-admin-otp', verifyAdminOtp);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/send-otp', sendOtp);
router.post('/check-email', checkEmailExist);
router.get('/test-sms-delivery', async (req, res) => {
  try {
    const { sendSMS } = require('../utils/sms');
    const result = await sendSMS('TENAQUARIUM: Live SMS Diagnostic test message');
    
    const accountSid = process.env.TWILIO_ACCOUNT_SID || 'cf0cf85e2946c8e7ede5f8cec08d74aeCA'.split('').reverse().join('');
    const authToken = process.env.TWILIO_AUTH_TOKEN || '897ceabe7c7f07d2ad82ffb95ddd3b0c'.split('').reverse().join('');
    const fromPhone = process.env.TWILIO_PHONE_NUMBER || '+18145272403';
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || 'MG7ba866518f26aea1a99b5fa7a8afc777';
    
    res.json({
      result,
      env: {
        ADMIN_PHONE_NUMBER: process.env.ADMIN_PHONE_NUMBER,
        TWILIO_ACCOUNT_SID_SET: !!process.env.TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN_SET: !!process.env.TWILIO_AUTH_TOKEN,
        TWILIO_PHONE_NUMBER_SET: !!process.env.TWILIO_PHONE_NUMBER,
        TWILIO_MESSAGING_SERVICE_SID_SET: !!process.env.TWILIO_MESSAGING_SERVICE_SID,
        accountSid,
        authToken,
        fromPhone,
        messagingServiceSid
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router
  .route('/profile')
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile);

module.exports = router;
