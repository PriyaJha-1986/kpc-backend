import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Razorpay from 'razorpay';

dotenv.config();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

app.post('/create-order', async (req, res) => {
  const { amount, currency = "INR", receipt = "receipt#1" } = req.body;
  try {
    const order = await razorpay.orders.create({ amount, currency, receipt });
    res.status(200).json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Order creation failed' });
  }
});

app.get("/", (req, res) => {
  res.send("Kanha Poshak Creations Backend is up ✨");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
