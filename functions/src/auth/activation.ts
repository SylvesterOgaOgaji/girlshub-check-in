import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import TelegramBot from 'node-telegram-bot-api';

// Define shape of incoming data
interface ActivationData {
  phone?: string;
  email?: string;
}

// Correct handler signature for firebase-functions v4.x
export const sendActivationCode = functions.https.onCall(
  async (request: functions.https.CallableRequest<ActivationData>) => {
    const { phone, email } = request.data;

    if (!phone && !email) {
      throw new functions.https.HttpsError('invalid-argument', 'Phone number or email is required.');
    }

    const activationCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
    const ttl = 10 * 60 * 1000; // 10 minutes
    const db = admin.firestore();

    try {
      await db.collection('activationCodes').doc(activationCode).set({
        phone: phone || null,
        email: email || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(), // ✅ Works in both emulator and production
        expiresAt: new Date(Date.now() + ttl),
   });

      console.log(`Saved code ${activationCode} for phone: ${phone}, email: ${email}`);

      const botToken = functions.config().telegram?.token;
      if (botToken && phone) {
        const bot = new TelegramBot(botToken);
        try {
          await bot.sendMessage(phone, `Your GirlsHub activation code: ${activationCode}`);
          console.log(`Sent to Telegram ID: ${phone}`);
        } catch (telegramError) {
          console.error(`Telegram error for ${phone}:`, telegramError);
        }
      }

      if (email) {
        console.log(`Email (placeholder) for ${email} with code ${activationCode}`);
      }

      return { status: 'success', message: 'Activation code sent.' };
    } catch (error) {
      console.error('Activation error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to send activation code.', error);
    }
  }
);
