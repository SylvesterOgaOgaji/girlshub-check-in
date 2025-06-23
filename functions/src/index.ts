        // functions/src/index.ts
        import * as admin from 'firebase-admin';
        import * as functions from 'firebase-functions';

        // Initialize Firebase Admin SDK
        admin.initializeApp();

        // Export all callable functions from auth
        export * from './auth/activation';

        // You can add more Cloud Functions here as needed.
        // For example, HTTP functions or Firestore triggers.

        // Example: A simple HTTP function
        export const helloWorld = functions.https.onRequest((request, response) => {
          functions.logger.info("Hello logs!", {structuredData: true});
          response.send("Hello from Firebase!");
        });
        
