const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false, // Optional for Google reviews
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    rating: {
      type: Number,
      required: [true, 'Please add a rating between 1 and 5'],
      min: 1,
      max: 5,
    },
    review: {
      type: String,
      required: [true, 'Please add a review text'],
    },
    status: {
      type: String,
      enum: ['approved', 'pending', 'rejected'],
      default: 'pending',
    },
    source: {
      type: String,
      enum: ['local', 'google'],
      default: 'local',
    },
    authorName: {
      type: String,
      default: '',
    },
    googleReviewId: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Prevent user from submitting more than one review per product (only for local users)
reviewSchema.index(
  { productId: 1, customerId: 1 },
  { unique: true, partialFilterExpression: { customerId: { $exists: true } } }
);

// Prevent duplicate Google reviews from being synced
reviewSchema.index(
  { googleReviewId: 1 },
  { unique: true, partialFilterExpression: { googleReviewId: { $exists: true, $gt: "" } } }
);

// Index for high performance querying by product
reviewSchema.index({ productId: 1 });

// Static method to get avg rating and save
reviewSchema.statics.getAverageRating = async function (productId) {
  const obj = await this.aggregate([
    {
      $match: { productId: productId, status: 'approved' },
    },
    {
      $group: {
        _id: '$productId',
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 },
      },
    },
  ]);

  try {
    if (obj.length > 0) {
      await mongoose.model('Product').findByIdAndUpdate(productId, {
        averageRating: Math.round(obj[0].averageRating * 10) / 10,
        totalReviews: obj[0].totalReviews,
      });
    } else {
      await mongoose.model('Product').findByIdAndUpdate(productId, {
        averageRating: 0,
        totalReviews: 0,
      });
    }
  } catch (err) {
    console.error('Error updating product average rating:', err);
  }
};

// Call getAverageRating after save
reviewSchema.post('save', function () {
  this.constructor.getAverageRating(this.productId);
});

// Call getAverageRating before remove or deleteOne
reviewSchema.post('deleteOne', { document: true, query: false }, function () {
  this.constructor.getAverageRating(this.productId);
});

module.exports = mongoose.model('Review', reviewSchema);
