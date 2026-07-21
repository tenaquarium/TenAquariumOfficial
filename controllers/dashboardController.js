const User = require('../models/User');
const Dealer = require('../models/Dealer');
const Product = require('../models/Product');
const Order = require('../models/Order');

// @desc    Get Admin Dashboard Stats
// @route   GET /api/dashboard/admin
// @access  Private/Admin
const getAdminStats = async (req, res) => {
  try {
    const totalCustomers = await User.countDocuments({ role: 'customer' });
    const totalDealers = await Dealer.countDocuments({});
    const totalProducts = await Product.countDocuments({});
    
    // Calculate total orders and revenue
    const orders = await Order.find({ paymentStatus: 'paid' });
    const totalOrdersCount = await Order.countDocuments({});
    const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);

    // Monthly Sales Report for the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const monthlyAggregation = await Order.aggregate([
      {
        $match: {
          paymentStatus: 'paid',
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          sales: { $sum: '$totalAmount' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    // Format monthly report for frontend charts
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlySalesReport = monthlyAggregation.map((item) => {
      return {
        month: `${months[item._id.month - 1]} ${item._id.year}`,
        sales: item.sales,
        orders: item.count,
      };
    });

    res.json({
      totalCustomers,
      totalDealers,
      totalProducts,
      totalOrders: totalOrdersCount,
      totalRevenue,
      monthlySalesReport,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get Dealer Dashboard Stats
// @route   GET /api/dashboard/dealer
// @access  Private/Dealer
const getDealerStats = async (req, res) => {
  try {
    const products = await Product.find({ dealerId: req.user._id });
    const uniqueNames = new Set(products.map(p => p.productName.trim().toLowerCase()));
    const totalProducts = uniqueNames.size;
    
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

    // Find all paid orders containing dealer's items that are at least 3 hours old
    const orders = await Order.find({
      'products.dealerId': req.user._id,
      paymentStatus: 'paid',
      createdAt: { $lte: threeHoursAgo }
    });

    const totalOrdersCount = orders.length;

    // Calculate dealer revenue
    let totalRevenue = 0;
    orders.forEach(order => {
      order.products.forEach(item => {
        if (item.dealerId.toString() === req.user._id.toString()) {
          totalRevenue += item.price * item.quantity;
        }
      });
    });

    // Monthly Sales Report for dealer (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    // Fetch and filter orders for aggregation manually or via aggregation pipeline
    // To be precise and fast, we can aggregate with pipeline matching dealer items
    const dealerMonthlyAggregation = await Order.aggregate([
      {
        $match: {
          paymentStatus: 'paid',
          createdAt: { $gte: sixMonthsAgo, $lte: threeHoursAgo },
          'products.dealerId': req.user._id
        }
      },
      {
        $unwind: '$products'
      },
      {
        $match: {
          'products.dealerId': req.user._id
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            orderId: '$_id'
          },
          orderAmount: { $sum: { $multiply: ['$products.price', '$products.quantity'] } }
        }
      },
      {
        $group: {
          _id: {
            year: '$_id.year',
            month: '$_id.month'
          },
          sales: { $sum: '$orderAmount' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlySalesReport = dealerMonthlyAggregation.map((item) => {
      return {
        month: `${months[item._id.month - 1]} ${item._id.year}`,
        sales: item.sales,
        orders: item.count,
      };
    });

    res.json({
      totalProducts,
      totalOrders: totalOrdersCount,
      totalRevenue,
      monthlySalesReport,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAdminStats,
  getDealerStats,
};
