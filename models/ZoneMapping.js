const mongoose = require('mongoose');

const zoneMappingSchema = new mongoose.Schema(
  {
    pincodeStart: {
      type: String,
      required: [true, 'Please specify start pincode'],
      trim: true,
      validate: {
        validator: function (v) {
          return /^[1-9][0-9]{5}$/.test(v);
        },
        message: 'Start pincode must be a valid 6-digit Indian PIN code',
      },
    },
    pincodeEnd: {
      type: String,
      required: [true, 'Please specify end pincode'],
      trim: true,
      validate: {
        validator: function (v) {
          return /^[1-9][0-9]{5}$/.test(v);
        },
        message: 'End pincode must be a valid 6-digit Indian PIN code',
      },
    },
    zone: {
      type: String,
      required: [true, 'Please select zone'],
      enum: ['Zone A', 'Zone B', 'Zone C', 'Zone D', 'Zone E'],
    },
    stateName: {
      type: String,
      required: [true, 'Please specify state/UT name'],
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Add index to prevent overlapping or duplicate mappings if needed, or simple compound index
zoneMappingSchema.index({ pincodeStart: 1, pincodeEnd: 1 }, { unique: true });

module.exports = mongoose.model('ZoneMapping', zoneMappingSchema);
