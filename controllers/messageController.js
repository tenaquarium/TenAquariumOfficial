const Message = require('../models/Message');
const User = require('../models/User');

// @desc    Send a message
// @route   POST /api/messages
// @access  Private
const sendMessage = async (req, res) => {
  const { receiverId, messageText } = req.body;
  const senderId = req.user._id;

  try {
    if (!receiverId || !messageText) {
      return res.status(400).json({ message: 'Receiver ID and message text are required' });
    }

    const message = await Message.create({
      senderId,
      receiverId,
      messageText,
    });

    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get messages with a partner
// @route   GET /api/messages/:partnerId
// @access  Private
const getMessages = async (req, res) => {
  const { partnerId } = req.params;
  const userId = req.user._id;

  try {
    const messages = await Message.find({
      $or: [
        { senderId: userId, receiverId: partnerId },
        { senderId: partnerId, receiverId: userId },
      ],
    }).sort({ createdAt: 1 });

    // Mark messages sent by the partner to the current user as read
    await Message.updateMany(
      { senderId: partnerId, receiverId: userId, read: false },
      { $set: { read: true } }
    );

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get conversation partners with last message and unread count
// @route   GET /api/messages/conversations
// @access  Private
const getConversations = async (req, res) => {
  const userId = req.user._id;

  try {
    // Find all messages involving user
    const messages = await Message.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
    }).sort({ createdAt: -1 });

    const conversationsMap = {};

    for (const msg of messages) {
      const partnerId = msg.senderId.toString() === userId.toString()
        ? msg.receiverId.toString()
        : msg.senderId.toString();

      if (!conversationsMap[partnerId]) {
        conversationsMap[partnerId] = {
          lastMessage: msg,
          unreadCount: 0,
        };
      }

      // Count unread messages sent by the partner to the current user
      if (msg.receiverId.toString() === userId.toString() && !msg.read) {
        conversationsMap[partnerId].unreadCount += 1;
      }
    }

    const partnerIds = Object.keys(conversationsMap);
    const partners = await User.find({ _id: { $in: partnerIds } }).select('name email role');

    const conversations = partners.map(partner => {
      const info = conversationsMap[partner._id.toString()];
      return {
        partner,
        lastMessage: info.lastMessage,
        unreadCount: info.unreadCount,
      };
    });

    // Sort conversations by last message timestamp descending
    conversations.sort((a, b) => b.lastMessage.createdAt - a.lastMessage.createdAt);

    res.json(conversations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  sendMessage,
  getMessages,
  getConversations,
};
