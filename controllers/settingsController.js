const Settings = require('../models/Settings');

// @desc    Get free shipping config
// @route   GET /api/settings/free-shipping
// @access  Public
const getFreeShippingConfig = async (req, res) => {
  try {
    let config = await Settings.findOne({ key: 'freeShipping' });
    if (!config) {
      config = await Settings.create({
        key: 'freeShipping',
        value: {
          status: 'ON',
          startDate: '2026-08-01',
          endDate: '2026-08-31',
        },
      });
    }
    res.json(config.value);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update free shipping config
// @route   PUT /api/settings/free-shipping
// @access  Private/Admin
const updateFreeShippingConfig = async (req, res) => {
  try {
    const { status, startDate, endDate } = req.body;
    let config = await Settings.findOneAndUpdate(
      { key: 'freeShipping' },
      { value: { status, startDate, endDate } },
      { new: true, upsert: true }
    );
    res.json(config.value);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getFreeShippingConfig,
  updateFreeShippingConfig,
};
