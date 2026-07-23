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

// @desc    Approve dealer via SMS link
// @route   GET /api/dealers/sms-approve/:id
// @access  Public
const smsApproveDealer = async (req, res) => {
  try {
    const dealer = await Dealer.findById(req.params.id);
    if (!dealer) {
      return res.status(404).send('<h1>Dealer profile not found</h1>');
    }

    dealer.approvalStatus = 'approved';
    await dealer.save();

    res.send(`
      <html>
        <head>
          <title>Dealer Approved</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #f0f9ff; margin: 0; }
            .card { background: white; padding: 3rem; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); text-align: center; max-width: 400px; border: 1px solid #e0f2fe; }
            h1 { color: #0284c7; margin-bottom: 1rem; }
            p { color: #475569; line-height: 1.6; }
            .badge { background: #dcfce7; color: #15803d; padding: 0.5rem 1rem; border-radius: 20px; font-weight: bold; display: inline-block; margin-top: 1rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Approval Complete</h1>
            <p><strong>${dealer.businessName}</strong> has been successfully approved as an active dealer.</p>
            <span class="badge">Approved ✓</span>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(\`<h1>Error: \${error.message}</h1>\`);
  }
};

// @desc    Reject dealer via SMS link
// @route   GET /api/dealers/sms-reject/:id
// @access  Public
const smsRejectDealer = async (req, res) => {
  try {
    const dealer = await Dealer.findById(req.params.id);
    if (!dealer) {
      return res.status(404).send('<h1>Dealer profile not found</h1>');
    }

    dealer.approvalStatus = 'rejected';
    await dealer.save();

    res.send(`
      <html>
        <head>
          <title>Dealer Rejected</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #fff1f2; margin: 0; }
            .card { background: white; padding: 3rem; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); text-align: center; max-width: 400px; border: 1px solid #ffe4e6; }
            h1 { color: #e11d48; margin-bottom: 1rem; }
            p { color: #475569; line-height: 1.6; }
            .badge { background: #ffe4e6; color: #991b1b; padding: 0.5rem 1rem; border-radius: 20px; font-weight: bold; display: inline-block; margin-top: 1rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Dealer Rejected</h1>
            <p><strong>${dealer.businessName}</strong> store application has been rejected.</p>
            <span class="badge">Rejected ✗</span>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(\`<h1>Error: \${error.message}</h1>\`);
  }
};

module.exports = {
  getDealers,
  updateDealerApproval,
  editDealerAdmin,
  deleteDealerAdmin,
  getPublicDealerProfile,
  getApprovedDealersPublic,
  smsApproveDealer,
  smsRejectDealer,
};
