const Dealer = require('../models/Dealer');
const User = require('../models/User');
const Product = require('../models/Product');

// @desc    Get all dealers
// @route   GET /api/dealers
// @access  Private/Admin
const getDealers = async (req, res) => {
  try {
    const dealers = await Dealer.find({}).populate('userId', 'status');
    res.json(dealers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Approve or Reject dealer registration
// @route   PUT /api/dealers/:id/approval
// @access  Private/Admin
const updateDealerApproval = async (req, res) => {
  const { approvalStatus, rejectionReason } = req.body; // 'approved' or 'rejected'

  if (!['approved', 'rejected', 'pending'].includes(approvalStatus)) {
    return res.status(400).json({ message: 'Invalid approval status' });
  }

  try {
    const dealer = await Dealer.findById(req.params.id);
    if (!dealer) {
      return res.status(404).json({ message: 'Dealer profile not found' });
    }

    dealer.approvalStatus = approvalStatus;
    if (approvalStatus === 'rejected') {
      dealer.rejectionReason = rejectionReason || '';
    } else if (approvalStatus === 'approved') {
      dealer.rejectionReason = ''; // Clear it out
    }
    await dealer.save();

    res.json({ message: `Dealer approval status updated to ${approvalStatus}`, dealer });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Admin edit dealer details
// @route   PUT /api/dealers/:id
// @access  Private/Admin
const editDealerAdmin = async (req, res) => {
  const { businessName, ownerName, email, phone, address } = req.body;

  try {
    const dealer = await Dealer.findById(req.params.id);
    if (!dealer) {
      return res.status(404).json({ message: 'Dealer profile not found' });
    }

    dealer.businessName = businessName || dealer.businessName;
    dealer.ownerName = ownerName || dealer.ownerName;
    dealer.phone = phone || dealer.phone;
    dealer.address = address || dealer.address;

    if (email && email !== dealer.email) {
      dealer.email = email;
      // Also update email in User
      await User.findByIdAndUpdate(dealer.userId, { email });
    }

    const updatedDealer = await dealer.save();
    res.json(updatedDealer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Admin delete dealer
// @route   DELETE /api/dealers/:id
// @access  Private/Admin
const deleteDealerAdmin = async (req, res) => {
  try {
    const dealer = await Dealer.findById(req.params.id);
    if (!dealer) {
      return res.status(404).json({ message: 'Dealer profile not found' });
    }

    // Delete associated User account
    await User.findByIdAndDelete(dealer.userId);

    // Delete all products created by this dealer
    await Product.deleteMany({ dealerId: dealer.userId });

    // Delete dealer profile
    await Dealer.deleteOne({ _id: req.params.id });

    res.json({ message: 'Dealer profile, user account, and all associated products deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get public dealer profile details & products
// @route   GET /api/dealers/:id/public
// @access  Public
const getPublicDealerProfile = async (req, res) => {
  try {
    const dealer = await Dealer.findById(req.params.id);
    if (!dealer) {
      return res.status(404).json({ message: 'Dealer profile not found' });
    }

    // Fetch products belonging to this dealer (userId of dealer matches dealerId in Product)
    const products = await Product.find({ dealerId: dealer.userId });

    res.json({
      dealer,
      products,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all approved dealers for public directory
// @route   GET /api/dealers/approved/public
// @access  Public
const getApprovedDealersPublic = async (req, res) => {
  try {
    const dealers = await Dealer.find({ approvalStatus: 'approved' }).select('businessName ownerName email phone address logo description msmeCertificate');
    res.json(dealers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getDealers,
  updateDealerApproval,
  editDealerAdmin,
  deleteDealerAdmin,
  getPublicDealerProfile,
  getApprovedDealersPublic,
};
