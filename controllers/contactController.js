const Contact = require('../models/Contact');
const { sendSMS } = require('../utils/sms');

// @desc    Submit contact message
// @route   POST /api/contact
// @access  Public
const submitContactForm = async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    // 1. Save to Database
    const contact = await Contact.create({
      name,
      email,
      subject,
      message,
    });

    // 2. Format SMS and send to Admin
    // Format SMS layout as:
    // name: [username]
    // mail: [email]
    // subject: [subject]
    // Message: [message]
    const prefix = `name: ${name}\nmail: ${email}\nsubject: ${subject}\nMessage: `;
    const maxChars = 120; // safe buffer for Twilio 160-char trial limit
    const remainingSpace = maxChars - prefix.length;
    
    let displayMessage = message;
    if (remainingSpace > 0 && message.length > remainingSpace) {
      displayMessage = message.substring(0, remainingSpace - 3) + '...';
    } else if (remainingSpace <= 0) {
      displayMessage = message.substring(0, 10) + '...';
    }
    
    const smsMessage = `${prefix}${displayMessage}`;

    // Fire-and-forget: send SMS asynchronously in the background so HTTP response is instant
    sendSMS(smsMessage).catch((smsErr) => {
      console.error('Error sending contact form SMS to admin:', smsErr.message);
    });

    res.status(201).json({
      success: true,
      message: 'Message submitted successfully. Admin notified.',
      contact,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getContacts = async (req, res) => {
  try {
    const contacts = await Contact.find({}).sort({ createdAt: -1 });
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const replyToContact = async (req, res) => {
  const { replyMessage } = req.body;

  if (!replyMessage) {
    return res.status(400).json({ message: 'Reply message is required' });
  }

  try {
    const contact = await Contact.findById(req.params.id);

    if (!contact) {
      return res.status(404).json({ message: 'Inquiry not found' });
    }

    contact.status = 'replied';
    contact.replyMessage = replyMessage;
    contact.repliedAt = new Date();
    await contact.save();

    // Send email copy using our utility
    const { sendInquiryReplyEmail } = require('../utils/mail');
    await sendInquiryReplyEmail(contact.email, contact.name, contact.subject, contact.message, replyMessage);

    res.json({
      success: true,
      message: 'Reply sent successfully and customer notified by email.',
      contact,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  submitContactForm,
  getContacts,
  replyToContact,
};
