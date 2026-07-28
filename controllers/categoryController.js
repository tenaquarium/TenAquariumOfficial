const Category = require('../models/Category');

// @desc    Get all categories
// @route   GET /api/categories
// @access  Public
const getCategories = async (req, res) => {
  try {
    const categories = await Category.find({}).sort({ name: 1 });
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new category
// @route   POST /api/categories
// @access  Private/Admin
const createCategory = async (req, res) => {
  try {
    const { name, iconName } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const exists = await Category.findOne({ name });
    if (exists) {
      return res.status(400).json({ message: 'Category already exists' });
    }

    const category = await Category.create({ name, iconName: iconName || 'Compass' });
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a category
// @route   DELETE /api/categories/:id
// @access  Private/Admin
const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    await Category.deleteOne({ _id: req.params.id });
    res.status(200).json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Seed function to pre-populate default categories
const seedDefaultCategories = async () => {
  try {
    const count = await Category.countDocuments({});
    if (count === 0) {
      console.log('Seeding default categories...');
      const defaults = [
        { name: 'Aquarium Fish', iconName: 'Fish' },
        { name: 'Fish Food', iconName: 'Zap' },
        { name: 'Aquarium Tanks', iconName: 'Compass' },
        { name: 'Aquarium Filters', iconName: 'Award' },
        { name: 'Aquarium Lights', iconName: 'Zap' },
        { name: 'Aquarium Decorations', iconName: 'Compass' },
        { name: 'Aquarium Plants', iconName: 'Fish' },
        { name: 'Aquarium Accessories', iconName: 'ShieldAlert' },
        { name: 'Custom Tank Setup', iconName: 'Compass' }
      ];
      await Category.insertMany(defaults);
      console.log('Default categories seeded successfully!');
    }
  } catch (err) {
    console.error('Error seeding default categories:', err.message);
  }
};

module.exports = {
  getCategories,
  createCategory,
  deleteCategory,
  seedDefaultCategories
};
