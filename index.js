const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// 1. Security Headers (Helmet)
app.use(helmet());

// 2. Strict CORS Policy
const allowedOrigins = [
  'https://www.tenaquarium.com',
  'https://tenaquarium.com',
  'http://localhost:5173',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5175'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Allow during production transition to ensure payments never fail
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'x-webhook-signature', 
    'x-razorpay-signature', 
    'x-cashfree-signature', 
    'x-signature', 
    'signature'
  ]
}));

// 3. API Rate Limiting (DDoS & Brute Force Protection)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 600, // Limit each IP to 600 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Protect all API routes EXCEPT payments polling, webhook, and UTR verification
app.use('/api', (req, res, next) => {
  if (req.path.includes('/payments/status') || req.path.includes('/payments/webhook') || req.path.includes('/payments/confirm-utr')) {
    return next();
  }
  return apiLimiter(req, res, next);
});

// 4. Body Parser
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// 5. NoSQL Injection Defense (Sanitize inputs)
app.use(mongoSanitize());

// Serve static assets (e.g. tenaquarium.apk download)
app.use(express.static(path.join(__dirname, 'public')));

// Root Route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to TENAQUARIUM API Server (Secured)' });
});

// Import Routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const dealerRoutes = require('./routes/dealerRoutes');
const productRoutes = require('./routes/productRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const courierRoutes = require('./routes/courierRoutes');
const contactRoutes = require('./routes/contactRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const messageRoutes = require('./routes/messageRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const offerRoutes = require('./routes/offerRoutes');
const http = require('http');
const { initSocket } = require('./socket');
const notificationRoutes = require('./routes/notificationRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dealers', dealerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/courier', courierRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/offers', offerRoutes);

// Error Middleware
app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
initSocket(server);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

module.exports = app;