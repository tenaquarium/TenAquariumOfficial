const mongoose = require('mongoose');

const courierRateSchema = new mongoose.Schema(
  {
    courierName: {
      type: String,
      required: [true, 'Please add a courier partner name'],
      trim: true,
    },
    fromZone: {
      type: String,
      required: [true, 'Please specify from zone'],
      enum: ['Zone A', 'Zone B', 'Zone C', 'Zone D', 'Zone E'],
    },
    toZone: {
      type: String,
      required: [true, 'Please specify to zone'],
      enum: ['Zone A', 'Zone B', 'Zone C', 'Zone D', 'Zone E'],
    },
    shipmentType: {
      type: String,
      required: [true, 'Please select shipment type'],
      enum: ['Document', 'Non-Document'],
    },
    serviceType: {
      type: String,
      required: [true, 'Please select service type'],
      enum: ['Surface', 'Express'],
    },
    baseWeight: {
      type: Number,
      required: [true, 'Please specify base weight in kg'],
      min: [0, 'Base weight cannot be negative'],
    },
    basePrice: {
      type: Number,
      required: [true, 'Please specify base price'],
      min: [0, 'Base price cannot be negative'],
    },
    additionalKgPrice: {
      type: Number,
      required: [true, 'Please specify additional price per kg'],
      min: [0, 'Additional price cannot be negative'],
    },
    fuelChargePercent: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Fuel charge percentage cannot be negative'],
    },
    gstPercent: {
      type: Number,
      required: true,
      default: 18,
      min: [0, 'GST percentage cannot be negative'],
    },
    activeStatus: {
      type: Boolean,
      required: true,
      default: true,
    },
    estDays: {
      type: Number,
      required: [true, 'Please specify estimated delivery days'],
      min: [1, 'Estimated delivery days must be at least 1'],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('CourierRate', courierRateSchema);
