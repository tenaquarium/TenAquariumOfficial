const express = require('express');
const router = express.Router();
const {
  sendMessage,
  getMessages,
  getConversations,
} = require('../controllers/messageController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.post('/', sendMessage);
router.get('/conversations', getConversations);
router.get('/:partnerId', getMessages);

module.exports = router;
