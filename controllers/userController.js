const User = require('../models/User');
const Order = require('../models/Order');

// @desc    Get all customers
// @route   GET /api/users/customers
// @access  Private/Admin
const getCustomers = async (req, res) => {
  try {
    const customers = await User.find({ role: 'customer' }).select('-password');
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Admin edit customer
// @route   PUT /api/users/customers/:id
// @access  Private/Admin
const editCustomerAdmin = async (req, res) => {
  const { name, email, phone, status } = req.body;

  try {
    const customer = await User.findOne({ _id: req.params.id, role: 'customer' });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    customer.name = name || customer.name;
    customer.phone = phone || customer.phone;
    customer.status = status || customer.status;

    if (email && email !== customer.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ message: 'Email already in use' });
      }
      customer.email = email;
    }

    const updatedCustomer = await customer.save();
    res.json({
      _id: updatedCustomer._id,
      name: updatedCustomer.name,
      email: updatedCustomer.email,
      phone: updatedCustomer.phone,
      role: updatedCustomer.role,
      status: updatedCustomer.status,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Admin block or unblock customer
// @route   PUT /api/users/customers/:id/block
// @access  Private/Admin
const toggleCustomerBlock = async (req, res) => {
  const { status } = req.body; // 'active' or 'blocked'

  if (!['active', 'blocked'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  try {
    const customer = await User.findOne({ _id: req.params.id });
    if (!customer) {
      return res.status(404).json({ message: 'User not found' });
    }

    customer.status = status;
    await customer.save();

    res.json({ message: `Customer status updated to ${status}`, customer });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Admin delete customer
// @route   DELETE /api/users/customers/:id
// @access  Private/Admin
const deleteCustomerAdmin = async (req, res) => {
  try {
    const customer = await User.findOne({ _id: req.params.id, role: 'customer' });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Delete customer
    await User.deleteOne({ _id: req.params.id });

    // Optional: Delete customer's order history, or keep it but dereference?
    // We'll keep orders for financial history, or delete them. Let's just delete the user.
    res.json({ message: 'Customer account deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getCustomers,
  editCustomerAdmin,
  toggleCustomerBlock,
  deleteCustomerAdmin,
};
