const CourierRate = require('../models/CourierRate');
const ZoneMapping = require('../models/ZoneMapping');

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
  const {
    pickupPincode,
    deliveryPincode,
    actualWeight,
    length,
    width,
    height,
    shipmentType,
    serviceType,
    dealerId,
  } = req.body;

  // Validation
  const pincodeRegex = /^[1-9][0-9]{5}$/;
  if (!pickupPincode || !pincodeRegex.test(pickupPincode)) {
    return res.status(400).json({ message: 'Pickup pincode must be a valid 6-digit Indian PIN code' });
  }
  if (!deliveryPincode || !pincodeRegex.test(deliveryPincode)) {
    return res.status(400).json({ message: 'Delivery pincode must be a valid 6-digit Indian PIN code' });
  }

  const actW = Number(actualWeight);
  if (isNaN(actW) || actW <= 0) {
    return res.status(400).json({ message: 'Actual weight must be a positive number' });
  }

  const l = Number(length);
  const w = Number(width);
  const h = Number(height);
  if (isNaN(l) || l <= 0 || isNaN(w) || w <= 0 || isNaN(h) || h <= 0) {
    return res.status(400).json({ message: 'Shipment dimensions (L, W, H) must be positive values' });
  }

  if (!shipmentType || !['Document', 'Non-Document'].includes(shipmentType)) {
    return res.status(400).json({ message: 'Shipment type must be Document or Non-Document' });
  }

  if (!serviceType || !['Surface', 'Express'].includes(serviceType)) {
    return res.status(400).json({ message: 'Service type must be Surface or Express' });
  }

  try {
    // 1. Resolve Zones
    const pickupZoneInfo = await getZoneForPincode(pickupPincode);
    if (!pickupZoneInfo) {
      return res.status(400).json({ message: `Pickup pincode ${pickupPincode} is not supported or out of zone mapping.` });
    }

    const deliveryZoneInfo = await getZoneForPincode(deliveryPincode);
    if (!deliveryZoneInfo) {
      return res.status(400).json({ message: `Delivery pincode ${deliveryPincode} is not supported or out of zone mapping.` });
    }

    const fromZone = pickupZoneInfo.zone;
    const toZone = deliveryZoneInfo.zone;

    // 2. Weight Calculations
    const volumetricWeight = (l * w * h) / 5000;
    const rawChargeableWeight = Math.max(actW, volumetricWeight);
    const chargeableWeight = roundWeightToSlab(rawChargeableWeight);

    // 3. Resolve Dealer Courier Services if dealerId is provided
    let allowedCouriers = null;
    if (dealerId) {
      const mongoose = require('mongoose');
      const Dealer = mongoose.model('Dealer');
      let dealer = await Dealer.findById(dealerId);
      if (!dealer) {
        dealer = await Dealer.findOne({ userId: dealerId });
      }
      if (dealer && dealer.courierServices && dealer.courierServices.length > 0) {
        allowedCouriers = dealer.courierServices;
      }
    }

    // 4. Query Active Rate Cards
    const query = {
      fromZone,
      toZone,
      shipmentType,
      serviceType,
      activeStatus: true,
    };
    if (allowedCouriers) {
      query.courierName = { $in: allowedCouriers };
    }
    const rates = await CourierRate.find(query);

    const quotes = rates.map((rate) => {
      const baseWeight = rate.baseWeight;
      const basePrice = rate.basePrice;
      const additionalKgPrice = rate.additionalKgPrice;
      const fuelChargePercent = rate.fuelChargePercent;
      const gstPercent = rate.gstPercent;

      let baseCharge = basePrice;
      if (chargeableWeight > baseWeight) {
        // e.g. baseWeight = 0.5kg, chargeableWeight = 2.0kg. Additional weight = 1.5kg
        const additionalWeight = chargeableWeight - baseWeight;
        // Courier services charge additional weight in whole slabs (rounded up to the next full kg slab)
        const additionalKgSlabs = Math.ceil(additionalWeight);
        baseCharge = basePrice + (additionalKgSlabs * additionalKgPrice);
      }

      const fuelCharge = Math.round((baseCharge * fuelChargePercent) / 100 * 100) / 100;
      const gst = Math.round(((baseCharge + fuelCharge) * gstPercent) / 100 * 100) / 100;
      const finalAmount = Math.round((baseCharge + fuelCharge + gst) * 100) / 100;

      return {
        courierName: rate.courierName,
        baseCharge,
        fuelCharge,
        gst,
        finalAmount,
        estDays: rate.estDays,
      };
    });

    // Sort by final amount to find the cheapest
    quotes.sort((a, b) => a.finalAmount - b.finalAmount);

    res.json({
      success: true,
      pickupZone: fromZone,
      pickupState: pickupZoneInfo.stateName,
      deliveryZone: toZone,
      deliveryState: deliveryZoneInfo.stateName,
      actualWeight: actW,
      volumetricWeight,
      chargeableWeight,
      quotes,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
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

module.exports = {
  calculateRates,
  getAllRates,
  upsertRate,
  deleteRate,
  getAllZones,
  upsertZone,
  deleteZone,
};
