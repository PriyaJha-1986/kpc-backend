// Filename: index.js
// This is your complete, updated backend server file.

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import fetch from 'node-fetch'; // Make sure to install this: npm install node-fetch

dotenv.config();

const app = express();

// ✅ Secure CORS (No change needed)
const allowedOrigins = ['https://kanhaposhakcreations.onrender.com', 'http://127.0.0.1:5500']; // Added localhost for testing
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

// ✅ Razorpay Initialization (No change needed)
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ✅ --- NEW: Shiprocket Configuration ---
const SHIPROCKET_EMAIL = process.env.SHIPROCKET_EMAIL; // e.g., jhakumarshekhar11@gmail.com
const SHIPROCKET_PASSWORD = process.env.SHIPROCKET_PASSWORD; // e.g., your new password
let shiprocketToken = null;

async function getShiprocketToken() {
    // NOTE: In a production app, you'd store and check the expiry of the token.
    // For simplicity here, we get a new one each time, which is fine for low traffic.
    try {
        const response = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: SHIPROCKET_EMAIL, password: SHIPROCKET_PASSWORD })
        });
        const data = await response.json();
        if (!data.token) throw new Error("Failed to get Shiprocket token");
        shiprocketToken = data.token;
        return shiprocketToken;
    } catch (error) {
        console.error("❌ Error getting Shiprocket token:", error.message);
        return null;
    }
}

// ✅ --- NEW: Shipping Rate Endpoint ---
app.post('/get-shipping-rate', async (req, res) => {
    const { destinationPincode, weight, isCOD, subtotal } = req.body;

    // Basic validation
    if (!destinationPincode || !weight || !subtotal) {
        return res.status(400).json({ success: false, message: "Missing required fields for shipping calculation." });
    }

    const token = await getShiprocketToken();
    if (!token) {
        return res.status(500).json({ success: false, message: "Could not authenticate with shipping provider." });
    }

    const params = new URLSearchParams({
        pickup_postcode: "110092", // <-- IMPORTANT: Set your business's pickup pincode here
        delivery_postcode: destinationPincode,
        weight: weight,
        cod: isCOD ? 1 : 0,
        order_invoice_value: subtotal
    }).toString();

    const url = `https://apiv2.shiprocket.in/v1/external/courier/serviceability/?${params}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.status === 200 && data.data.available_courier_companies?.length > 0) {
            const recommendedId = data.data.recommended_courier_company_id;
            const courier = data.data.available_courier_companies.find(c => c.courier_company_id === recommendedId) || data.data.available_courier_companies[0];
            
            res.json({ success: true, shippingCost: courier.rate });
        } else {
            throw new Error(data.message || "Pincode not serviceable");
        }
    } catch (error) {
        console.error("❌ Shiprocket API Error:", error.message);
        res.status(400).json({ success: false, message: "This pincode is currently not serviceable." });
    }
});


// ✅ Create Order (No change needed)
app.post('/create-order', async (req, res) => {
  // ... your existing code
});

// ✅ Verify Signature (No change needed)
app.post('/verify-payment', (req, res) => {
  // ... your existing code
});

// ✅ Health Check (No change needed)
app.get("/", (req, res) => {
  res.send("✅ Kanha Poshak Creations Backend is up and running.");
});

// ✅ Server Listen (No change needed)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));