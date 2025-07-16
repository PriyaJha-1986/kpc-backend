import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Razorpay from 'razorpay';
import crypto from 'crypto';

dotenv.config();

const app = express();

// ✅ Secure CORS (Allow only your frontend)
const allowedOrigins = ['https://kanhaposhakcreations.onrender.com'];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed from this origin'));
    }
  }
}));

app.use(express.json());

// ✅ Razorpay Initialization (Secure using env variables)
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ✅ Create Order
app.post('/create-order', async (req, res) => {
  const { amount, currency = "INR", receipt = "receipt#1" } = req.body;
  if (!amount) return res.status(400).json({ error: "Amount is required." });

  try {
    const order = await razorpay.orders.create({
      amount: parseInt(amount),
      currency,
      receipt,
    });
    res.status(200).json(order);
  } catch (err) {
    console.error("❌ Razorpay Order Error:", err);
    res.status(500).json({ error: 'Order creation failed' });
  }
});

// ✅ Verify Signature (Used after payment success)
app.post('/verify-payment', (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const sign = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(sign)
    .digest('hex');

  if (expectedSignature === razorpay_signature) {
    return res.status(200).json({ success: true, message: "Payment verified." });
  } else {
    return res.status(400).json({ success: false, message: "Signature mismatch!" });
  }
});

// ✅ Health Check
app.get("/", (req, res) => {
  res.send("✅ Kanha Poshak Creations Backend is up and running.");
});

// ✅ Server Listen
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
