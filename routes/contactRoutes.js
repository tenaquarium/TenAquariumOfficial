const express = require('express');
const router = express.Router();
const { submitContactForm, getContacts, replyToContact } = require('../controllers/contactController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.post('/', submitContactForm);

// Protected Admin Inquiry management
router.get('/', protect, authorize('admin'), getContacts);
router.post('/:id/reply', protect, authorize('admin'), replyToContact);

module.exports = router;
