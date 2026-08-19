const CourierRate = require('../models/CourierRate');
const ZoneMapping = require('../models/ZoneMapping');
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
const getZoneForPincode = async (pincode) => {
  const match = await ZoneMapping.findOne({
    pincodeStart: { $lte: pincode },
    pincodeEnd: { $gte: pincode }
  });
  return match ? { zone: match.zone, stateName: match.stateName } : null;
};

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
const getAllZones = async (req, res) => {
  try {
    const zones = await ZoneMapping.find({}).sort({ pincodeStart: 1 });
    res.json(zones);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Upsert zone mapping
// @route   POST /api/courier/zones
// @access  Private/Admin
const upsertZone = async (req, res) => {
  const { id, pincodeStart, pincodeEnd, zone, stateName } = req.body;

  try {
    let mapping;
    if (id) {
      mapping = await ZoneMapping.findById(id);
    }

    if (mapping) {
      mapping.pincodeStart = pincodeStart || mapping.pincodeStart;
      mapping.pincodeEnd = pincodeEnd || mapping.pincodeEnd;
      mapping.zone = zone || mapping.zone;
      mapping.stateName = stateName || mapping.stateName;

      await mapping.save();
      res.json({ success: true, message: 'Zone mapping updated successfully', mapping });
    } else {
      const newMapping = await ZoneMapping.create({
        pincodeStart,
        pincodeEnd,
        zone,
        stateName,
      });
      res.status(201).json({ success: true, message: 'Zone mapping created successfully', mapping: newMapping });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete zone mapping
// @route   DELETE /api/courier/zones/:id
// @access  Private/Admin
const deleteZone = async (req, res) => {
  try {
    const mapping = await ZoneMapping.findByIdAndDelete(req.params.id);
    if (!mapping) {
      return res.status(404).json({ message: 'Zone mapping not found' });
    }
    res.json({ success: true, message: 'Zone mapping deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Check courier availability, resolve district/state and areas for a pincode
// @route   POST /api/courier/check-availability
// @access  Public
const checkAvailability = async (req, res) => {
  const { deliveryPincode, dealerId, weight } = req.body;
  const pincodeRegex = /^[1-9][0-9]{5}$/;
  if (!deliveryPincode || !pincodeRegex.test(deliveryPincode)) {
    return res.status(400).json({ message: 'Delivery pincode must be a valid 6-digit Indian PIN code' });
  }

  try {
    let district = 'District';
    let state = '';
    let areas = [];

    // 1. Try Indian Postal API first
    try {
      const response = await fetch(`https://api.postalpincode.in/pincode/${deliveryPincode}`);
      const data = await response.json();
      if (data && data[0] && data[0].Status === 'Success') {
        const postOffices = data[0].PostOffice;
        if (postOffices && postOffices.length > 0) {
          district = postOffices[0].District;
          state = postOffices[0].State;
          areas = postOffices.map(po => po.Name).filter(Boolean);
        }
      }
    } catch (apiErr) {
      console.error('Postal API error in backend check-availability', apiErr.message);
    }

    // 2. If not resolved, try ZoneMapping
    if (!state) {
      const deliveryZoneInfo = await getZoneForPincode(deliveryPincode);
      if (deliveryZoneInfo) {
        state = deliveryZoneInfo.stateName || '';
        district = state === 'Tamil Nadu' ? 'Salem' : 'District';
      }
    }

    // 3. Fallback to first-digit region mapping if still not resolved
    if (!state) {
      const firstDigit = deliveryPincode[0];
      if (firstDigit === '6') {
        state = 'Tamil Nadu';
      } else if (firstDigit === '5') {
        state = 'Karnataka';
      } else if (firstDigit === '4') {
        state = 'Maharashtra';
      } else if (firstDigit === '3') {
        state = 'Gujarat';
      } else {
        state = 'Delhi';
      }
      district = state === 'Tamil Nadu' ? 'Salem' : 'District';
    }

    if (areas.length === 0) {
      areas = ['Salem Central', 'Town Delivery Hub', 'Suburbs Sector'];
    }

    // Calculate dynamic state-based shipping rate
    const cleanState = (state || '').toLowerCase().replace(/\s+/g, '');
    let ratePerKg = 150;
    if (cleanState.includes('tamilnadu') || cleanState === 'tn') {
      ratePerKg = 50;
    }

    const freeShipping = await isFreeShippingActive();
    const finalAmount = freeShipping ? 0 : Math.max(1, Math.ceil(weight || 0.5)) * ratePerKg;

    const quotes = [
      {
        serviceType: 'Standard',
        finalAmount: finalAmount,
        estDays: cleanState.includes('tamilnadu') ? 2 : 5
      }
    ];

    res.json({
      success: true,
      available: true,
      courierName: 'Standard Shipping',
      quotes,
      district,
      state,
      areas
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  calculateRates,
  getAllRates,
  upsertRate,
  deleteRate,
  getAllZones,
  upsertZone,
  deleteZone,
  checkAvailability
};
