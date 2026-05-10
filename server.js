import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import admin from 'firebase-admin';

dotenv.config();

// ✅ 1. Initialize Firebase Admin using Environment Variables
// We use .replace(/\\n/g, '\n') because hosting providers sometimes escape newline characters in environment variables.
const privateKey = process.env.FIREBASE_PRIVATE_KEY 
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
    : undefined;

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: privateKey
  })
});
const db = admin.firestore();

const app = express();
// ✅ 2. Secure CORS
app.use(cors({
  origin: [
    'https://kanhaposhakcreations.onrender.com', 
    'http://127.0.0.1:5500', 
    'http://localhost:5500'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ✅ 3. Razorpay Initialization
console.log("--- DEBUG SECRETS ---");
console.log("Does Key ID exist?", !!process.env.RAZORPAY_KEY_ID);
console.log("Does Key Secret exist?", !!process.env.RAZORPAY_KEY_SECRET);
console.log("---------------------");
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID.trim(),
  key_secret: process.env.RAZORPAY_KEY_SECRET.trim()
});

// ✅ 4. Shiprocket Configuration
const SHIPROCKET_EMAIL = process.env.SHIPROCKET_EMAIL; 
const SHIPROCKET_PASSWORD = process.env.SHIPROCKET_PASSWORD; 
let shiprocketToken = null;

async function getShiprocketToken() {
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

// ✅ 5. ZERO-TRUST: Secure Order Creation
app.post('/create-order', async (req, res) => {
    try {
        // The frontend now only sends the IDs, quantities, and destination
        const { items, destinationPincode, weight = 1, discountPercent = 0 } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ error: "Cart is empty." });
        }

        // --- A. CALCULATE TRUE SUBTOTAL FROM FIREBASE ---
        let calculatedSubtotal = 0;

        for (const cartItem of items) {
            const productDoc = await db.collection('products').doc(cartItem.productId).get();
            
            if (!productDoc.exists) {
                return res.status(400).json({ error: `Product ${cartItem.productId} no longer exists.` });
            }

            const productData = productDoc.data();
            let actualPrice = productData.price;

            // If the user selected a variant (e.g., Size 4), check if the variant has a different price
            if (cartItem.variantName && productData.variants) {
                const variant = productData.variants.find(v => v.name === cartItem.variantName);
                if (variant && variant.price) {
                    actualPrice = variant.price;
                }
            }

            calculatedSubtotal += actualPrice * cartItem.quantity;
        }

        // --- B. APPLY DISCOUNT ---
        const discountAmount = calculatedSubtotal * (discountPercent / 100);
        const subtotalAfterDiscount = calculatedSubtotal - discountAmount;

        // --- C. CALCULATE SHIPPING VIA SHIPROCKET ---
        let shippingCost = 0;
        if (destinationPincode) {
            const token = await getShiprocketToken();
            if (token) {
                const params = new URLSearchParams({
                    pickup_postcode: "110092", // Your business pincode
                    delivery_postcode: destinationPincode,
                    weight: weight,
                    cod: 0, // Razorpay is prepaid
                    order_invoice_value: subtotalAfterDiscount
                }).toString();

                const shipRes = await fetch(`https://apiv2.shiprocket.in/v1/external/courier/serviceability/?${params}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const shipData = await shipRes.json();

                if (shipData.status === 200 && shipData.data.available_courier_companies?.length > 0) {
                    const recommendedId = shipData.data.recommended_courier_company_id;
                    const courier = shipData.data.available_courier_companies.find(c => c.courier_company_id === recommendedId) || shipData.data.available_courier_companies[0];
                    shippingCost = courier.rate;
                } else {
                    // Fallback shipping if pincode API fails but is roughly valid
                    shippingCost = destinationPincode.startsWith('11') ? 40 : 100; 
                }
            }
        }

        // --- D. CALCULATE FINAL TRUE TOTAL ---
        const finalTotal = subtotalAfterDiscount + shippingCost;

        // --- E. CREATE RAZORPAY ORDER ---
        const options = {
            amount: Math.round(finalTotal * 100), // Razorpay expects paise (multiply by 100)
            currency: "INR",
            receipt: `rcpt_${Date.now()}`
        };

        const order = await razorpay.orders.create(options);
        
        // Send the secure order payload back to the frontend
        res.json({
            id: order.id,
            amount: order.amount,
            currency: order.currency,
            verifiedSubtotal: calculatedSubtotal,
            verifiedShipping: shippingCost
        });

    } catch (err) {
        console.error("❌ Order Creation Error:", err);
        res.status(500).json({ error: "Failed to securely generate order." });
    }
});

// ✅ 6. ZERO-TRUST: Verify Payment Signature
// This ensures hackers didn't spoof a "success" message on the frontend
app.post('/verify-payment', (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET.trim())
        .update(body.toString())
        .digest("hex");

    if (expectedSignature === razorpay_signature) {
        res.json({ success: true, message: "Payment verified successfully" });
    } else {
        res.status(400).json({ success: false, message: "Invalid payment signature" });
    }
});

// ✅ Health Check
app.get("/", (req, res) => {
  res.send("✅ Kanha Poshak Creations SECURE Backend is up and running.");
});

// ✅ Server Listen
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Secure Backend running on port ${PORT}`));
