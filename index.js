const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors({ origin: true })); // Or restrict to your frontend domain
app.use(express.json());

// Initialize Firebase Admin SDK (if not already done)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require('./serviceAccountKey.json'))
  });
}
const db = admin.firestore();

app.post('/placeOrder', async (req, res) => {
  try {
    const orderData = req.body.orderData;
    // Atomically increment the order counter
    const counterRef = db.collection('counters').doc('orders');
    let orderNumber;
    await db.runTransaction(async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      if (!counterDoc.exists) {
        transaction.set(counterRef, { current: 1 });
        orderNumber = 1;
      } else {
        orderNumber = (counterDoc.data().current || 0) + 1;
        transaction.update(counterRef, { current: orderNumber });
      }
    });
    const orderId = `KPCOD${orderNumber.toString().padStart(4, '0')}`;
    const orderToSave = {
      ...orderData,
      orderId: orderId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('orders').add(orderToSave);
    return res.status(200).json({ orderId });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
