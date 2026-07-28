const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  iconName: { type: String, default: 'Compass' }
}, { timestamps: true });

module.exports = mongoose.model('Category', categorySchema);
