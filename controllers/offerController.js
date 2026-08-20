const Offer = require('../models/Offer');
const Product = require('../models/Product');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { sendSMS } = require('../utils/sms');

// Helper to mask emails
const maskEmail = (email) => {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  if (local.length <= 2) {
    return `${local[0]}**@${domain}`;
  }
  return `${local.substring(0, 2)}***${local.substring(local.length - 2)}@${domain}`;
};

// Helper to combine Date and Time strings into a Date object
const combineDateAndTime = (dateStr, timeStr) => {
  // dateStr is 'YYYY-MM-DD', timeStr is 'HH:MM'
  return new Date(`${dateStr}T${timeStr}:00`);
};

// Helper to update expired offers
const syncExpiredOffers = async () => {
  const now = new Date();
  await Offer.updateMany(
    {
      status: { $in: ['APPROVED', 'SUBMITTED', 'UNDER REVIEW', 'DRAFT'] },
      endDateTime: { $lt: now }
    },
    { status: 'EXPIRED' }
  );
};

// @desc    Create a new offer
// @route   POST /api/offers
// @access  Private (Dealer only)
const createOffer = async (req, res) => {
  try {
    const {
      offerScope,
      productSelectionType,
      targetProducts,
      targetCategories,
      targetCustomers,
      customerType,
      benefitType,
      benefitValue,
      specialPrices,
      buyX,
      getY,
      buyMoreSaveMoreTiers,
      freeDeliveryType,
      minimumOrderValue,
      maximumDiscount,
      usageLimit,
      customerUsageLimit,
      startDate,
      endDate,
      startTime,
      endTime,
      offerName,
      description,
      bannerImage,
      status // 'DRAFT' or 'SUBMITTED'
    } = req.body;

    const dealerId = req.user._id;

    // Validate Status is either DRAFT or SUBMITTED
    const finalStatus = status === 'SUBMITTED' ? 'SUBMITTED' : 'DRAFT';

    // 1. Date Validation
    if (!startDate || !endDate || !startTime || !endTime) {
      return res.status(400).json({ message: 'Start/End dates and times are required' });
    }
    const startDateTime = combineDateAndTime(startDate, startTime);
    const endDateTime = combineDateAndTime(endDate, endTime);

    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      return res.status(400).json({ message: 'Invalid start or end date/time format' });
    }

    if (startDateTime >= endDateTime) {
      return res.status(400).json({ message: 'Start date/time must be before end date/time' });
    }

    const now = new Date();
    if (endDateTime <= now) {
      return res.status(400).json({ message: 'End date/time must be in the future' });
    }

    // 2. Validate Product Ownership (Rule 7: Never trust dealer-submitted product IDs without backend ownership validation)
    if (offerScope === 'product' && targetProducts && targetProducts.length > 0) {
      const ownedProducts = await Product.find({
        _id: { $in: targetProducts },
        dealerId: dealerId
      });

      if (ownedProducts.length !== targetProducts.length) {
        return res.status(403).json({
          message: 'Security validation failed: One or more selected products do not belong to you or do not exist.'
        });
      }

      // Rule 4: Offer price must never accidentally become higher than original price for a discount offer
      if (benefitType === 'special_price' && specialPrices && specialPrices.length > 0) {
        for (const sp of specialPrices) {
          const matchedProd = ownedProducts.find(p => p._id.toString() === sp.productId.toString());
          if (matchedProd && sp.price >= matchedProd.price) {
            return res.status(400).json({
              message: `Special price (₹${sp.price}) for ${matchedProd.productName} must be lower than its original price (₹${matchedProd.price})`
            });
          }
        }
      }
    }

    // Benefit checks
    if (benefitType === 'percentage' && (benefitValue <= 0 || benefitValue > 100)) {
      return res.status(400).json({ message: 'Percentage discount must be between 1% and 100%' });
    }

    if (benefitType === 'fixed' && benefitValue <= 0) {
      return res.status(400).json({ message: 'Fixed discount amount must be greater than 0' });
    }

    // Create offer
    const offer = await Offer.create({
      dealerId,
      offerScope,
      productSelectionType,
      targetProducts: offerScope === 'product' ? targetProducts : [],
      targetCategories: offerScope === 'category' ? targetCategories : [],
      targetCustomers: customerType === 'selected' ? targetCustomers : [],
      customerType,
      benefitType,
      benefitValue: ['percentage', 'fixed', 'free_delivery'].includes(benefitType) ? benefitValue : 0,
      specialPrices: benefitType === 'special_price' ? specialPrices : [],
      buyX: benefitType === 'buy_x_get_y' ? buyX : 0,
      getY: benefitType === 'buy_x_get_y' ? getY : 0,
      buyMoreSaveMoreTiers: benefitType === 'buy_more_save_more' ? buyMoreSaveMoreTiers : [],
      freeDeliveryType: benefitType === 'free_delivery' ? freeDeliveryType : null,
      minimumOrderValue: minimumOrderValue || 0,
      maximumDiscount: maximumDiscount || 0,
      usageLimit: usageLimit || null,
      customerUsageLimit: customerUsageLimit || null,
      startDate,
      endDate,
      startTime,
      endTime,
      startDateTime,
      endDateTime,
      offerName,
      description,
      bannerImage,
      status: finalStatus
    });

    if (finalStatus === 'SUBMITTED') {
      const admins = await User.find({ role: 'admin' });
      for (const admin of admins) {
        await Notification.create({
          userId: admin._id,
          dealerId: dealerId,
          offerId: offer._id,
          type: 'DEALER_OFFER_SUBMITTED',
          title: 'NEW DEALER OFFER',
          message: `Dealer ${req.user.name || req.user.dealerProfile?.businessName || 'Unknown'} submitted a new offer: "${offerName}"`,
          link: `/admin/dashboard?tab=offers&offerId=${offer._id}`
        });
        // Call sendSMS directly. If admin.phone is undefined, sms.js uses ADMIN_PHONE_NUMBER automatically.
        sendSMS(`New Dealer Offer: "${offerName}" was submitted for your review by ${req.user.name || 'a dealer'}. Login to approve.`, admin.phone);
      }
    }

    res.status(201).json(offer);
  } catch (error) {
    console.error('Error creating offer:', error);
    res.status(500).json({ message: 'Server error creating offer', error: error.message });
  }
};

// @desc    Get all offers of the logged-in dealer
// @route   GET /api/offers/dealer
// @access  Private (Dealer only)
const getDealerOffers = async (req, res) => {
  try {
    await syncExpiredOffers();
    const dealerId = req.user._id;
    const offers = await Offer.find({ dealerId }).sort({ createdAt: -1 });

    // Calculate status stats
    const stats = {
      all: offers.length,
      DRAFT: offers.filter(o => o.status === 'DRAFT').length,
      SUBMITTED: offers.filter(o => o.status === 'SUBMITTED').length,
      APPROVED: offers.filter(o => o.status === 'APPROVED' && o.endDateTime >= new Date()).length,
      ACTIVE: offers.filter(o => o.status === 'APPROVED' && o.startDateTime <= new Date() && o.endDateTime >= new Date()).length,
      REJECTED: offers.filter(o => o.status === 'REJECTED').length,
      EXPIRED: offers.filter(o => o.status === 'EXPIRED' || (o.status === 'APPROVED' && o.endDateTime < new Date())).length,
    };

    res.json({ offers, stats });
  } catch (error) {
    console.error('Error fetching dealer offers:', error);
    res.status(500).json({ message: 'Server error fetching offers' });
  }
};

// @desc    Get a masked list of customers for targeting selection
// @route   GET /api/offers/customers
// @access  Private (Dealer/Admin only)
const getCustomersList = async (req, res) => {
  try {
    const customers = await User.find({ role: 'customer' }).select('name email');
    const masked = customers.map(c => ({
      _id: c._id,
      name: c.name,
      email: maskEmail(c.email)
    }));
    res.json(masked);
  } catch (error) {
    console.error('Error fetching customers list:', error);
    res.status(500).json({ message: 'Server error fetching customer list' });
  }
};

// @desc    Get offer by ID
// @route   GET /api/offers/:id
// @access  Private (Dealer/Admin)
const getOfferById = async (req, res) => {
  try {
    await syncExpiredOffers();
    const offer = await Offer.findById(req.id || req.params.id)
      .populate('dealerId', 'name email phone')
      .populate('targetProducts', 'productName price images')
      .populate('targetCustomers', 'name email');

    if (!offer) {
      return res.status(404).json({ message: 'Offer not found' });
    }

    // Security check: dealer can only see their own offers
    if (req.user.role === 'dealer' && offer.dealerId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to view this offer' });
    }

    res.json(offer);
  } catch (error) {
    console.error('Error fetching offer by ID:', error);
    res.status(500).json({ message: 'Server error fetching offer' });
  }
};

// @desc    Update an offer
// @route   PUT /api/offers/:id
// @access  Private (Dealer only)
const updateOffer = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);

    if (!offer) {
      return res.status(404).json({ message: 'Offer not found' });
    }

    // Security check: must be owner
    if (offer.dealerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to edit this offer' });
    }

    // Rule: Cannot edit active or approved offer directly without triggering new approval cycle
    // (If it was APPROVED or SUBMITTED, updating it should move it back to DRAFT or SUBMITTED for review)
    // Wait, prompt says: "Do not allow editing an already active offer in a way that bypasses admin approval. If an active offer needs important changes, create a new approval cycle."
    // So if the offer is APPROVED or ACTIVE, we should reject direct edits unless they move the status back to SUBMITTED for review.
    // Let's set the status of updated offers to either DRAFT or SUBMITTED (whichever the user selects), so it resets status and forces admin re-approval.
    const { status: bodyStatus } = req.body;
    const finalStatus = bodyStatus === 'SUBMITTED' ? 'SUBMITTED' : 'DRAFT';

    const {
      offerScope,
      productSelectionType,
      targetProducts,
      targetCategories,
      targetCustomers,
      customerType,
      benefitType,
      benefitValue,
      specialPrices,
      buyX,
      getY,
      buyMoreSaveMoreTiers,
      freeDeliveryType,
      minimumOrderValue,
      maximumDiscount,
      usageLimit,
      customerUsageLimit,
      startDate,
      endDate,
      startTime,
      endTime,
      offerName,
      description,
      bannerImage
    } = req.body;

    // Date Validation
    if (!startDate || !endDate || !startTime || !endTime) {
      return res.status(400).json({ message: 'Start/End dates and times are required' });
    }
    const startDateTime = combineDateAndTime(startDate, startTime);
    const endDateTime = combineDateAndTime(endDate, endTime);

    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      return res.status(400).json({ message: 'Invalid start or end date/time format' });
    }

    if (startDateTime >= endDateTime) {
      return res.status(400).json({ message: 'Start date/time must be before end date/time' });
    }

    const now = new Date();
    if (endDateTime <= now) {
      return res.status(400).json({ message: 'End date/time must be in the future' });
    }

    // Validate Product Ownership
    if (offerScope === 'product' && targetProducts && targetProducts.length > 0) {
      const ownedProducts = await Product.find({
        _id: { $in: targetProducts },
        dealerId: req.user._id
      });

      if (ownedProducts.length !== targetProducts.length) {
        return res.status(403).json({
          message: 'Security validation failed: One or more selected products do not belong to you.'
        });
      }

      // Offer price vs original price check
      if (benefitType === 'special_price' && specialPrices && specialPrices.length > 0) {
        for (const sp of specialPrices) {
          const matchedProd = ownedProducts.find(p => p._id.toString() === sp.productId.toString());
          if (matchedProd && sp.price >= matchedProd.price) {
            return res.status(400).json({
              message: `Special price (₹${sp.price}) for ${matchedProd.productName} must be lower than its original price (₹${matchedProd.price})`
            });
          }
        }
      }
    }

    // Benefit checks
    if (benefitType === 'percentage' && (benefitValue <= 0 || benefitValue > 100)) {
      return res.status(400).json({ message: 'Percentage discount must be between 1% and 100%' });
    }

    if (benefitType === 'fixed' && benefitValue <= 0) {
      return res.status(400).json({ message: 'Fixed discount amount must be greater than 0' });
    }

    // Update
    offer.offerScope = offerScope;
    offer.productSelectionType = productSelectionType;
    offer.targetProducts = offerScope === 'product' ? targetProducts : [];
    offer.targetCategories = offerScope === 'category' ? targetCategories : [];
    offer.targetCustomers = customerType === 'selected' ? targetCustomers : [];
    offer.customerType = customerType;
    offer.benefitType = benefitType;
    offer.benefitValue = ['percentage', 'fixed', 'free_delivery'].includes(benefitType) ? benefitValue : 0;
    offer.specialPrices = benefitType === 'special_price' ? specialPrices : [];
    offer.buyX = benefitType === 'buy_x_get_y' ? buyX : 0;
    offer.getY = benefitType === 'buy_x_get_y' ? getY : 0;
    offer.buyMoreSaveMoreTiers = benefitType === 'buy_more_save_more' ? buyMoreSaveMoreTiers : [];
    offer.freeDeliveryType = benefitType === 'free_delivery' ? freeDeliveryType : null;
    offer.minimumOrderValue = minimumOrderValue || 0;
    offer.maximumDiscount = maximumDiscount || 0;
    offer.usageLimit = usageLimit || null;
    offer.customerUsageLimit = customerUsageLimit || null;
    offer.startDate = startDate;
    offer.endDate = endDate;
    offer.startTime = startTime;
    offer.endTime = endTime;
    offer.startDateTime = startDateTime;
    offer.endDateTime = endDateTime;
    offer.offerName = offerName;
    offer.description = description;
    offer.bannerImage = bannerImage;
    offer.status = finalStatus;
    offer.rejectionReason = ''; // Reset rejection reason on update

    await offer.save();

    if (finalStatus === 'SUBMITTED') {
      const admins = await User.find({ role: 'admin' });
      for (const admin of admins) {
        await Notification.create({
          userId: admin._id,
          dealerId: req.user._id,
          offerId: offer._id,
          type: 'DEALER_OFFER_SUBMITTED',
          title: 'DEALER OFFER RE-SUBMITTED',
          message: `Dealer ${req.user.name || req.user.dealerProfile?.businessName || 'Unknown'} re-submitted offer: "${offerName}" for review`,
          link: `/admin/dashboard?tab=offers&offerId=${offer._id}`
        });
        // Call sendSMS directly so it falls back to ADMIN_PHONE_NUMBER if admin.phone is empty
        sendSMS(`Dealer Offer Re-submitted: "${offerName}" was re-submitted for your review by ${req.user.name || 'a dealer'}.`, admin.phone);
      }
    }

    res.json(offer);
  } catch (error) {
    console.error('Error updating offer:', error);
    res.status(500).json({ message: 'Server error updating offer', error: error.message });
  }
};

// @desc    Delete a draft offer
// @route   DELETE /api/offers/:id
// @access  Private (Dealer only)
const deleteOffer = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);

    if (!offer) {
      return res.status(404).json({ message: 'Offer not found' });
    }

    // Security check
    if (offer.dealerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this offer' });
    }

    // Only draft or rejected offers can be deleted
    if (offer.status !== 'DRAFT' && offer.status !== 'REJECTED') {
      return res.status(400).json({ message: 'Only Draft or Rejected offers can be deleted' });
    }

    await offer.deleteOne();
    res.json({ message: 'Offer deleted successfully' });
  } catch (error) {
    console.error('Error deleting offer:', error);
    res.status(500).json({ message: 'Server error deleting offer' });
  }
};

// @desc    Duplicate/Clone an existing offer
// @route   POST /api/offers/:id/duplicate
// @access  Private (Dealer only)
const duplicateOffer = async (req, res) => {
  try {
    const original = await Offer.findById(req.params.id);
    if (!original) {
      return res.status(404).json({ message: 'Original offer not found' });
    }

    // Security check
    if (original.dealerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to duplicate this offer' });
    }

    // Create a clone, reset status to DRAFT and clear dates if they are in the past
    const cloneData = original.toObject();
    delete cloneData._id;
    delete cloneData.createdAt;
    delete cloneData.updatedAt;
    
    cloneData.offerName = `${original.offerName} (Copy)`;
    cloneData.status = 'DRAFT';
    cloneData.rejectionReason = '';
    delete cloneData.approvedAt;

    // Shift start and end dates to today/future if original dates are past
    const now = new Date();
    if (original.endDateTime < now) {
      const durationMs = original.endDateTime - original.startDateTime;
      const newStart = new Date(now.getTime() + 24 * 60 * 60 * 1000); // start tomorrow
      const newEnd = new Date(newStart.getTime() + durationMs);
      
      const formatDigit = (n) => n.toString().padStart(2, '0');
      cloneData.startDate = `${newStart.getFullYear()}-${formatDigit(newStart.getMonth() + 1)}-${formatDigit(newStart.getDate())}`;
      cloneData.endDate = `${newEnd.getFullYear()}-${formatDigit(newEnd.getMonth() + 1)}-${formatDigit(newEnd.getDate())}`;
      cloneData.startDateTime = newStart;
      cloneData.endDateTime = newEnd;
    }

    const duplicate = await Offer.create(cloneData);
    res.status(201).json(duplicate);
  } catch (error) {
    console.error('Error duplicating offer:', error);
    res.status(500).json({ message: 'Server error duplicating offer' });
  }
};

// @desc    Get all offers (for Admin Approval Dashboard)
// @route   GET /api/offers/admin
// @access  Private (Admin only)
const getAdminOffers = async (req, res) => {
  try {
    await syncExpiredOffers();
    // Admin needs to see all offers except DRAFTS (or all offers, let's return all non-DRAFT offers)
    const offers = await Offer.find({ status: { $ne: 'DRAFT' } })
      .populate('dealerId', 'name email phone')
      .populate('targetProducts', 'productName price')
      .sort({ createdAt: -1 });

    res.json(offers);
  } catch (error) {
    console.error('Error fetching admin offers:', error);
    res.status(500).json({ message: 'Server error fetching offers for admin' });
  }
};

// @desc    Approve offer
// @route   POST /api/offers/:id/approve
// @access  Private (Admin only)
const approveOffer = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);
    if (!offer) {
      return res.status(404).json({ message: 'Offer not found' });
    }

    offer.status = 'APPROVED';
    offer.rejectionReason = '';
    offer.approvedAt = new Date();

    await offer.save();

    await Notification.create({
      userId: offer.dealerId, // notify dealer
      offerId: offer._id,
      type: 'OFFER_APPROVED',
      title: 'Offer Approved',
      message: `Your offer "${offer.offerName}" has been approved and will become active on the scheduled start date.`,
      link: `/dealer/dashboard?tab=offers&offerId=${offer._id}`
    });

    const dealer = await User.findById(offer.dealerId);
    if (dealer && dealer.phone) {
      sendSMS(`TEN Aquarium: Your offer "${offer.offerName}" has been APPROVED. It will go live at the scheduled time.`, dealer.phone);
    }

    res.json(offer);
  } catch (error) {
    console.error('Error approving offer:', error);
    res.status(500).json({ message: 'Server error approving offer' });
  }
};

// @desc    Reject offer with reason
// @route   POST /api/offers/:id/reject
// @access  Private (Admin only)
const rejectOffer = async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason) {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    const offer = await Offer.findById(req.params.id);
    if (!offer) {
      return res.status(404).json({ message: 'Offer not found' });
    }

    offer.status = 'REJECTED';
    offer.rejectionReason = rejectionReason;

    await offer.save();

    await Notification.create({
      userId: offer.dealerId, // notify dealer
      offerId: offer._id,
      type: 'OFFER_REJECTED',
      title: 'Offer Rejected',
      message: `Your offer "${offer.offerName}" was rejected. Reason: ${rejectionReason}`,
      link: `/dealer/dashboard?tab=offers&offerId=${offer._id}`
    });

    const dealer = await User.findById(offer.dealerId);
    if (dealer && dealer.phone) {
      sendSMS(`TEN Aquarium: Your offer "${offer.offerName}" was REJECTED. Reason: ${rejectionReason}`, dealer.phone);
    }

    res.json(offer);
  } catch (error) {
    console.error('Error rejecting offer:', error);
    res.status(500).json({ message: 'Server error rejecting offer' });
  }
};

// @desc    Get active approved offers (for Homepage carousel and All Offers Page)
// @route   GET /api/offers/active
// @access  Public
const getActiveOffers = async (req, res) => {
  try {
    await syncExpiredOffers();
    const now = new Date();
    
    // Find approved offers where startDateTime <= now and endDateTime >= now
    const offers = await Offer.find({
      status: 'APPROVED',
      startDateTime: { $lte: now },
      endDateTime: { $gte: now }
    })
      .populate('dealerId', 'name email phone')
      .populate('targetProducts', 'productName price images dealerId');

    res.json(offers);
  } catch (error) {
    console.error('Error fetching active offers:', error);
    res.status(500).json({ message: 'Server error fetching active offers' });
  }
};

module.exports = {
  createOffer,
  getDealerOffers,
  getCustomersList,
  getOfferById,
  updateOffer,
  deleteOffer,
  duplicateOffer,
  getAdminOffers,
  approveOffer,
  rejectOffer,
  getActiveOffers,
};
