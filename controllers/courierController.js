const CourierRate = require('../models/CourierRate');
const Settings = require('../models/Settings');

const isFreeShippingActive = async () => {
  const config = await Settings.findOne({ key: 'freeShipping' });
  if (config && config.value && config.value.status === 'ON') {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const { startDate, endDate } = config.value;
    if (startDate && today < startDate) return false;
    if (endDate && today > endDate) return false;
    return true;
  }
  return false;
};

// Helper: Find Zone for Pincode

// Helper: Round weight to next 0.5 kg slab
const roundWeightToSlab = (weight) => {
  // e.g. 1.2kg -> 1.5kg, 1.5kg -> 1.5kg, 1.6kg -> 2.0kg
  return Math.ceil(weight * 2) / 2;
};

// @desc    Calculate courier charges and compare rates
// @route   POST /api/courier/calculate
// @access  Public
const calculateRates = async (req, res) => {
  const { deliveryPincode } = req.body;
  const pincodeRegex = /^[1-9][0-9]{5}$/;
  if (!deliveryPincode || !pincodeRegex.test(deliveryPincode)) {
    return res.status(400).json({ message: 'Delivery pincode must be a valid 6-digit Indian PIN code' });
  }

  res.json({
    success: true,
    quotes: [
      {
        courierName: 'Free Shipping',
        estDays: 3,
        finalAmount: 0
      }
    ]
  });
};

// --- ADMIN PANELS ---

// @desc    Get all courier rates
// @route   GET /api/courier/rates
// @access  Private/Admin
const getAllRates = async (req, res) => {
  try {
    const rates = await CourierRate.find({}).sort({ courierName: 1, fromZone: 1, toZone: 1 });
    res.json(rates);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Upsert (create or update) courier rate card
// @route   POST /api/courier/rates
// @access  Private/Admin
const upsertRate = async (req, res) => {
  const {
    id,
    courierName,
    fromZone,
    toZone,
    shipmentType,
    serviceType,
    baseWeight,
    basePrice,
    additionalKgPrice,
    fuelChargePercent,
    gstPercent,
    activeStatus,
    estDays,
  } = req.body;

  try {
    let rate;
    if (id) {
      rate = await CourierRate.findById(id);
    }

    if (rate) {
      rate.courierName = courierName || rate.courierName;
      rate.fromZone = fromZone || rate.fromZone;
      rate.toZone = toZone || rate.toZone;
      rate.shipmentType = shipmentType || rate.shipmentType;
      rate.serviceType = serviceType || rate.serviceType;
      rate.baseWeight = baseWeight !== undefined ? Number(baseWeight) : rate.baseWeight;
      rate.basePrice = basePrice !== undefined ? Number(basePrice) : rate.basePrice;
      rate.additionalKgPrice = additionalKgPrice !== undefined ? Number(additionalKgPrice) : rate.additionalKgPrice;
      rate.fuelChargePercent = fuelChargePercent !== undefined ? Number(fuelChargePercent) : rate.fuelChargePercent;
      rate.gstPercent = gstPercent !== undefined ? Number(gstPercent) : rate.gstPercent;
      rate.activeStatus = activeStatus !== undefined ? activeStatus : rate.activeStatus;
      rate.estDays = estDays !== undefined ? Number(estDays) : rate.estDays;

      await rate.save();
      res.json({ success: true, message: 'Courier rate card updated successfully', rate });
    } else {
      const newRate = await CourierRate.create({
        courierName,
        fromZone,
        toZone,
        shipmentType,
        serviceType,
        baseWeight: Number(baseWeight),
        basePrice: Number(basePrice),
        additionalKgPrice: Number(additionalKgPrice),
        fuelChargePercent: Number(fuelChargePercent || 0),
        gstPercent: Number(gstPercent || 18),
        activeStatus: activeStatus !== undefined ? activeStatus : true,
        estDays: Number(estDays || 3),
      });
      res.status(201).json({ success: true, message: 'Courier rate card created successfully', rate: newRate });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete courier rate card
// @route   DELETE /api/courier/rates/:id
// @access  Private/Admin
const deleteRate = async (req, res) => {
  try {
    const rate = await CourierRate.findByIdAndDelete(req.params.id);
    if (!rate) {
      return res.status(404).json({ message: 'Rate card not found' });
    }
    res.json({ success: true, message: 'Rate card deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all zone mappings
// @route   GET /api/courier/zones
// @access  Private/Admin
module.exports = {
  calculateRates,
  getAllRates,
  upsertRate,
  deleteRate,
  checkAvailability
};
  checkAvailability
};
