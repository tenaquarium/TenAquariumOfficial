const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Dealer = require('../models/Dealer');
const Cart = require('../models/Cart');

// Check for repeated words or repeating characters
const hasRepeatedWords = (str) => {
  if (!str) return false;
  const cleanStr = str.replace(/\s+/g, '').toLowerCase();
  if (cleanStr.length > 0 && /^(.)\1+$/.test(cleanStr)) {
    return true;
  }
  const words = str.trim().toLowerCase().split(/\s+/);
  return new Set(words).size !== words.length;
};

// Extract Google Place ID from URL or literal string
const extractPlaceId = (input) => {
  if (!input) return '';
  try {
    const url = new URL(input);
    const placeIdParam = url.searchParams.get('placeid') || url.searchParams.get('place_id');
    if (placeIdParam) return placeIdParam;
  } catch (e) {}

  const gPageRegex = /g\.page\/r\/([a-zA-Z0-9_-]+)/;
  const match = input.match(gPageRegex);
  if (match && match[1]) return match[1];

  const placeIdRegex = /(ChIJ[a-zA-Z0-9_-]{23})/;
  const chIjMatch = input.match(placeIdRegex);
  if (chIjMatch && chIjMatch[1]) return chIjMatch[1];

  return input.trim();
};

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'tenaquarium_secret_key_12345', {
    expiresIn: '30d',
  });
};

// @desc    Register a new customer
// @route   POST /api/auth/register
// @access  Public
const registerCustomer = async (req, res) => {
  const { name, email, password, phone } = req.body;

  if (hasRepeatedWords(name)) {
    return res.status(400).json({ message: 'Name cannot contain repeated words' });
  }

  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: 'email already exist' });
    }

    const user = await User.create({
      name,
      email,
      password,
      phone,
      role: 'customer',
      status: 'active',
    });

    if (user) {
      // Create empty cart for the customer
      await Cart.create({ customerId: user._id, products: [] });

      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Register a new dealer
// @route   POST /api/auth/register-dealer
// @access  Public
const registerDealer = async (req, res) => {
  const { name, email, password, phone, businessName, ownerName, address, logo, description, msmeCertificate } = req.body;

  if (hasRepeatedWords(name)) {
    return res.status(400).json({ message: 'Name cannot contain repeated words' });
  }
  if (hasRepeatedWords(ownerName)) {
    return res.status(400).json({ message: 'Owner name cannot contain repeated words' });
  }

  try {
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'email already exist' });
    }

    // Create User account with role 'dealer'
    const user = await User.create({
      name,
      email,
      password,
      phone,
      role: 'dealer',
      status: 'active', // User is active, but Dealer details approvalStatus is pending
    });

    if (user) {
      // Create Dealer Profile
      const dealer = await Dealer.create({
        userId: user._id,
        businessName,
        ownerName,
        email,
        phone,
        address,
        logo: logo || '',
        description: description || '',
        msmeCertificate: msmeCertificate || '',
        courierServices: req.body.courierServices,
        approvalStatus: 'pending',
      });

      // Send SMS notification to Admin
      try {
        const { sendSMS } = require('../utils/sms');
        const baseUrl = process.env.SMS_REDIRECT_BASE_URL || 'https://ten-aquarium-official.vercel.app';
        const message = `New Dealer Registered: ${businessName} (Owner: ${ownerName})\n` +
          `Approve: ${baseUrl}/api/dealers/sms-approve/${dealer._id}\n` +
          `Reject: ${baseUrl}/api/dealers/sms-reject/${dealer._id}`;
        
        await sendSMS(message, process.env.ADMIN_PHONE_NUMBER);
      } catch (smsError) {
        console.error('Failed to send dealer registration SMS to admin:', smsError.message);
      }

      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        dealerProfile: dealer,
        token: generateToken(user._id),
        message: 'Dealer registration submitted. Admin approval is pending.',
      });
    } else {
      res.status(400).json({ message: 'Invalid dealer user data' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Auth user & get token (Customer, Dealer, Admin)
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      if (user.status === 'blocked') {
        return res.status(403).json({ message: 'Your account is blocked. Please contact admin.' });
      }

      // If dealer, fetch dealer profile
      let dealerProfile = null;
      if (user.role === 'dealer') {
        dealerProfile = await Dealer.findOne({ userId: user._id });
      }

      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
        dealerProfile,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      let dealerProfile = null;
      if (user.role === 'dealer') {
        dealerProfile = await Dealer.findOne({ userId: user._id });
      }

      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
        dealerProfile,
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      user.name = req.body.name || user.name;
      user.phone = req.body.phone || user.phone;

      // Email update (only if unique)
      if (req.body.email && req.body.email !== user.email) {
        const emailExists = await User.findOne({ email: req.body.email });
        if (emailExists) {
          return res.status(400).json({ message: 'Email already in use' });
        }
        user.email = req.body.email;
      }

      if (req.body.password) {
        user.password = req.body.password;
      }

      const updatedUser = await user.save();

      // If dealer, update dealer business info as well if provided
      let dealerProfile = null;
      if (user.role === 'dealer') {
        const dealer = await Dealer.findOne({ userId: user._id });
        if (dealer) {
          dealer.businessName = req.body.businessName || dealer.businessName;
          dealer.ownerName = req.body.ownerName || dealer.ownerName;
          dealer.phone = req.body.phone || dealer.phone;
          dealer.address = req.body.address || dealer.address;
          dealer.email = req.body.email || dealer.email;
          dealer.logo = req.body.logo !== undefined ? req.body.logo : dealer.logo;
          dealer.description = req.body.description !== undefined ? req.body.description : dealer.description;
          dealer.msmeCertificate = req.body.msmeCertificate !== undefined ? req.body.msmeCertificate : dealer.msmeCertificate;
          dealer.googlePlaceId = req.body.googlePlaceId !== undefined ? extractPlaceId(req.body.googlePlaceId) : dealer.googlePlaceId;
          dealer.courierServices = req.body.courierServices !== undefined ? req.body.courierServices : dealer.courierServices;
          
          dealer.bankName = req.body.bankName !== undefined ? req.body.bankName : dealer.bankName;
          dealer.accountHolderName = req.body.accountHolderName !== undefined ? req.body.accountHolderName : dealer.accountHolderName;
          dealer.accountNumber = req.body.accountNumber !== undefined ? req.body.accountNumber : dealer.accountNumber;
          dealer.ifscCode = req.body.ifscCode !== undefined ? req.body.ifscCode : dealer.ifscCode;
          dealer.branchName = req.body.branchName !== undefined ? req.body.branchName : dealer.branchName;

          if (req.body.resubmit === true) {
            dealer.approvalStatus = 'pending';
            dealer.rejectionReason = '';
          }
          
          dealerProfile = await dealer.save();
        }
      }

      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        role: updatedUser.role,
        status: updatedUser.status,
        dealerProfile,
        token: generateToken(updatedUser._id),
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Forgot Password (Request Reset)
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User with this email does not exist' });
    }

    // In production, we'd send an email. For this project, we return a token and simulated link
    const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'tenaquarium_secret_key_12345', {
      expiresIn: '10m', // 10 minutes to reset
    });

    res.json({
      message: 'Password reset link generated successfully.',
      resetToken, // Returned directly to simulated frontend
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Reset Password
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res) => {
  const { password, token } = req.body;

  try {
    if (!token) {
      return res.status(400).json({ message: 'Token is required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'tenaquarium_secret_key_12345');
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.password = password;
    await user.save();

    res.json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    res.status(400).json({ message: 'Invalid or expired token' });
  }
};

const sendOtp = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  const parts = email.split('@');
  if (parts.length !== 2) {
    return res.status(400).json({ message: 'Invalid email address format.' });
  }

  const username = parts[0];
  const domain = parts[1].toLowerCase();

  // Heuristics pattern check
  const isDummy = /^(test|fake|dummy|invalid|mock|random|user|admin)$/i.test(username) || 
                  /fake|dummy|invalid|tempmail/i.test(email);
  if (isDummy) {
    return res.status(400).json({ message: 'Verification failed: This email address is identified as a fake or simulated inbox.' });
  }

  // Gmail syntax constraints (6-30 chars, allowed chars)
  if (domain === 'gmail.com') {
    if (username.length < 6 || username.length > 30) {
      return res.status(400).json({ message: 'Invalid Gmail address: usernames must be between 6 and 30 characters long.' });
    }
    if (!/^[a-z0-9.]+$/i.test(username)) {
      return res.status(400).json({ message: 'Invalid Gmail address: usernames can only contain letters, numbers, and periods.' });
    }
    if (username.includes('..') || username.startsWith('.') || username.endsWith('.')) {
      return res.status(400).json({ message: 'Invalid Gmail address: periods cannot be consecutive or at the boundaries.' });
    }
  }

  // DNS MX record check to verify domain can receive email
  try {
    const dns = require('dns').promises;
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return res.status(400).json({ message: `Invalid domain: The email domain "${domain}" has no mail server configuration.` });
    }
  } catch (err) {
    return res.status(400).json({ message: `Invalid domain: The email domain "${domain}" does not exist or has no active mail servers.` });
  }

  // Generate 6 digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  let usingEthereal = false;
  let previewUrl = '';
  let offlineFallback = false;

  try {
    const nodemailer = require('nodemailer');
    let transporter;

    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      await transporter.sendMail({
        from: `"TENAQUARIUM Verification" <${process.env.SMTP_USER}>`,
        to: email,
        subject: "Your OTP Verification Code",
        text: `Your OTP verification code is: ${otp}`,
        html: `<div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0284c7;">TENAQUARIUM Email Verification</h2>
          <p>You are registering as a dealer on TENAQUARIUM. Please use the following 6-digit One-Time Password (OTP) to complete your email verification:</p>
          <div style="font-size: 24px; font-weight: bold; letter-spacing: 4px; padding: 10px; background: #f0fdf4; border: 1px solid #bbf7d0; display: inline-block; color: #15803d; border-radius: 4px;">
            ${otp}
          </div>
          <p style="margin-top: 20px; font-size: 12px; color: #64748b;">This OTP is valid for 10 minutes. If you did not request this, please ignore this email.</p>
        </div>`,
      });
    } else {
      // Ethereal fallback
      usingEthereal = true;
      let testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });

      let info = await transporter.sendMail({
        from: '"TENAQUARIUM Verification" <no-reply@tenaquarium.com>',
        to: email,
        subject: "Your OTP Verification Code",
        text: `Your OTP verification code is: ${otp}`,
        html: `<div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0284c7;">TENAQUARIUM Email Verification</h2>
          <p>You are registering as a dealer on TENAQUARIUM. Please use the following 6-digit One-Time Password (OTP) to complete your email verification:</p>
          <div style="font-size: 24px; font-weight: bold; letter-spacing: 4px; padding: 10px; background: #f0fdf4; border: 1px solid #bbf7d0; display: inline-block; color: #15803d; border-radius: 4px;">
            ${otp}
          </div>
          <p style="margin-top: 20px; font-size: 12px; color: #64748b;">This OTP is valid for 10 minutes. If you did not request this, please ignore this email.</p>
        </div>`,
      });
      previewUrl = nodemailer.getTestMessageUrl(info);
    }
  } catch (mailError) {
    console.warn("Mail server operation failed:", mailError);
    // Check if the error is due to an invalid recipient/email address
    const isRecipientError = mailError.code === 'EENVELOPE' || 
                             /recipient|address|550|553|501|invalid/i.test(mailError.message || '');
    if (isRecipientError) {
      return res.status(400).json({ message: 'The email address is invalid or does not exist.' });
    }
    offlineFallback = true;
  }

  res.json({
    success: true,
    otp,
    previewUrl,
    usingEthereal,
    offlineFallback
  });
};

const checkEmailExist = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    const userExists = await User.findOne({ email: email.toLowerCase() });
    res.json({ exists: !!userExists });
  } catch (error) {
    res.status(500).json({ message: 'Server error checking email' });
  }
};

module.exports = {
  registerCustomer,
  registerDealer,
  loginUser,
  getUserProfile,
  updateUserProfile,
  forgotPassword,
  resetPassword,
  sendOtp,
  checkEmailExist,
};
