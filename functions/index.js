/**
 * Cloud Functions for HoraPro Notification System
 * 
 * This implements Firebase Cloud Messaging (FCM) as an ADDITIONAL layer
 * on top of the existing Firestore-based notification system.
 * 
 * IMPORTANT: The existing system continues to work unchanged:
 * - Web app writes to Firestore collections/subcollections
 * - Mobile apps can still read directly from Firestore
 * - These functions ADD push notifications via FCM
 * 
 * Architecture:
 * 1. Web app creates notification document in Firestore (as before)
 * 2. Cloud Function triggers automatically on document creation
 * 3. Function sends FCM push notification to mobile devices
 * 4. Mobile app receives push AND can still query Firestore for history
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
admin.initializeApp();

/**
 * Send General Notification via FCM
 * 
 * Triggers when a new document is created in the GeneralNotification collection.
 * Sends push notification to ALL employees subscribed to 'all_employees' topic.
 * 
 * The original Firestore document remains untouched for mobile apps to query.
 */
exports.sendGeneralNotification = functions.firestore
  .document('GeneralNotification/{notificationId}')
  .onCreate(async (snap, context) => {
    try {
      const notification = snap.data();
      const notificationId = context.params.notificationId;
      
      console.log(`[FCM] Processing general notification: ${notificationId}`);
      
      // Prepare FCM message
      const message = {
        notification: {
          title: 'General Notification',
          body: notification.generalMessage || 'New notification available',
        },
        data: {
          type: 'general',
          notificationId: notificationId,
          timestamp: notification.createdAt?.toMillis().toString() || Date.now().toString(),
          message: notification.generalMessage || ''
        },
        topic: 'all_employees', // All subscribed devices receive this
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'general_notifications'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };
      
      // Send via FCM
      const response = await admin.messaging().send(message);
      console.log(`[FCM] General notification sent successfully:`, response);
      
      return response;
    } catch (error) {
      console.error('[FCM] Error sending general notification:', error);
      // Don't throw - we want Firestore write to succeed even if FCM fails
      return null;
    }
  });

/**
 * Send Private Notification via FCM
 * 
 * Triggers when a new document is created in users/{userId}/PrivateNotification.
 * Sends push notification to the SPECIFIC user's device(s).
 * 
 * Requires: User document must have 'fcmToken' field with device token.
 * The original Firestore document remains for querying notification history.
 */
exports.sendPrivateNotification = functions.firestore
  .document('users/{userId}/PrivateNotification/{notificationId}')
  .onCreate(async (snap, context) => {
    try {
      const notification = snap.data();
      const userId = context.params.userId;
      const notificationId = context.params.notificationId;
      
      console.log(`[FCM] Processing private notification for user: ${userId}`);
      
      // Get user's FCM token from their document
      const userDoc = await admin.firestore()
        .collection('users')
        .doc(userId)
        .get();
      
      if (!userDoc.exists) {
        console.log(`[FCM] User document not found: ${userId}`);
        return null;
      }
      
      const userData = userDoc.data();
      const fcmToken = userData.fcmToken;
      
      if (!fcmToken) {
        console.log(`[FCM] No FCM token registered for user: ${userId}`);
        // This is normal for users who haven't updated their app yet
        return null;
      }
      
      // Prepare FCM message for specific user
      const message = {
        notification: {
          title: 'Private Message',
          body: notification.privateMessage || 'You have a new private notification',
        },
        data: {
          type: 'private',
          notificationId: notificationId,
          userId: userId,
          timestamp: notification.createdAt?.toMillis().toString() || Date.now().toString(),
          message: notification.privateMessage || ''
        },
        token: fcmToken, // Send to specific device
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'private_notifications'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };
      
      // Send via FCM
      const response = await admin.messaging().send(message);
      console.log(`[FCM] Private notification sent to user ${userId}:`, response);
      
      return response;
    } catch (error) {
      // Handle invalid token error
      if (error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered') {
        console.log(`[FCM] Invalid token for user ${context.params.userId}, cleaning up...`);
        
        // Remove invalid token from user document
        await admin.firestore()
          .collection('users')
          .doc(context.params.userId)
          .update({ fcmToken: admin.firestore.FieldValue.delete() });
      } else {
        console.error('[FCM] Error sending private notification:', error);
      }
      
      return null;
    }
  });

/**
 * Send Schedule Notification via FCM
 * 
 * Triggers when a new document is created in users/{userId}/ScheduleNotification.
 * Sends push notification reminding user about upcoming shift.
 * 
 * This is triggered by the automatic schedule monitoring system that runs
 * every 2 minutes checking for shifts starting in 2 hours.
 * 
 * Requires: User document must have 'fcmToken' field.
 */
exports.sendScheduleNotification = functions.firestore
  .document('users/{userId}/ScheduleNotification/{notificationId}')
  .onCreate(async (snap, context) => {
    try {
      const notification = snap.data();
      const userId = context.params.userId;
      const notificationId = context.params.notificationId;
      
      console.log(`[FCM] Processing schedule notification for user: ${userId}`);
      
      // Get user's FCM token
      const userDoc = await admin.firestore()
        .collection('users')
        .doc(userId)
        .get();
      
      if (!userDoc.exists) {
        console.log(`[FCM] User document not found: ${userId}`);
        return null;
      }
      
      const userData = userDoc.data();
      const fcmToken = userData.fcmToken;
      
      if (!fcmToken) {
        console.log(`[FCM] No FCM token registered for user: ${userId}`);
        return null;
      }
      
      // Prepare FCM message with schedule details
      const message = {
        notification: {
          title: 'Shift Reminder',
          body: notification.scheduleMessage || 'Your shift is starting soon',
        },
        data: {
          type: 'schedule',
          notificationId: notificationId,
          userId: userId,
          shiftId: notification.shiftId || '',
          eventDate: notification.eventDate || '',
          startHour: notification.startHour || '',
          timestamp: notification.createdAt?.toMillis().toString() || Date.now().toString(),
          message: notification.scheduleMessage || '',
          notificationType: notification.notificationType || 'schedule_reminder'
        },
        token: fcmToken,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'schedule_notifications',
            tag: `shift_${notification.shiftId}` // Prevents duplicate notifications
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              threadId: `shift_${notification.shiftId}` // Groups related notifications
            }
          }
        }
      };
      
      // Send via FCM
      const response = await admin.messaging().send(message);
      console.log(`[FCM] Schedule notification sent to user ${userId}:`, response);
      
      return response;
    } catch (error) {
      // Handle invalid token error
      if (error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered') {
        console.log(`[FCM] Invalid token for user ${context.params.userId}, cleaning up...`);
        
        await admin.firestore()
          .collection('users')
          .doc(context.params.userId)
          .update({ fcmToken: admin.firestore.FieldValue.delete() });
      } else {
        console.error('[FCM] Error sending schedule notification:', error);
      }
      
      return null;
    }
  });

/**
 * Clean up old notifications (Optional maintenance function)
 * 
 * This function can be scheduled to run periodically to clean up
 * notifications older than 30 days to keep database size manageable.
 * 
 * To deploy as scheduled function, uncomment and configure:
 * exports.cleanupOldNotifications = functions.pubsub
 *   .schedule('0 2 * * *') // Run daily at 2 AM
 *   .timeZone('America/New_York')
 *   .onRun(async (context) => { ... });
 */

/**
 * Validate QR Token on Check-In/Check-Out Timestamp Updates
 * 
 * Triggers when checkInTimestamp or checkOutTimestamp fields are updated
 * in user schedule documents. Validates that the update includes a valid
 * QR token that matches the current time window.
 * 
 * If validation fails, the write is allowed to proceed (to maintain compatibility
 * with the existing app), but a rejection notification is sent to the user.
 * If validation succeeds, a success notification is sent.
 * 
 * This provides security monitoring while allowing the trusted app to function.
 */
exports.validateTimestampUpdate = functions.firestore
  .document('users/{userId}/UserSchedule/{scheduleId}')
  .onUpdate(async (change, context) => {
    try {
      const before = change.before.data();
      const after = change.after.data();
      const userId = context.params.userId;
      const scheduleId = context.params.scheduleId;

      const checkInChanged = before.checkInTimestamp !== after.checkInTimestamp &&
                            after.checkInTimestamp !== undefined;
      const checkOutChanged = before.checkOutTimestamp !== after.checkOutTimestamp &&
                             after.checkOutTimestamp !== undefined;

      if (!checkInChanged && !checkOutChanged) {
        return null;
      }

      console.log(`[Token Validator] Timestamp update detected for user ${userId}, schedule ${scheduleId}`);

      const qrTokenValue = after.qrTokenUsed || null;

      if (!qrTokenValue) {
        console.log(`[Token Validator] No QR token provided in update - potential unauthorized access`);
        
        await sendTimestampValidationNotification(
          userId,
          scheduleId,
          false,
          checkInChanged ? 'check-in' : 'check-out',
          'No QR token provided for validation'
        );
        
        return null;
      }

      const validationResult = await validateQRTokenServer(qrTokenValue);

      if (!validationResult.isValid) {
        console.log(`[Token Validator] Invalid token used: ${validationResult.message}`);
        
        await sendTimestampValidationNotification(
          userId,
          scheduleId,
          false,
          checkInChanged ? 'check-in' : 'check-out',
          validationResult.message
        );
        
        return null;
      }

      console.log(`[Token Validator] Valid token used for timestamp update`);
      
      await sendTimestampValidationNotification(
        userId,
        scheduleId,
        true,
        checkInChanged ? 'check-in' : 'check-out',
        'Timestamp recorded successfully'
      );

      return null;

    } catch (error) {
      console.error('[Token Validator] Error in timestamp validation:', error);
      return null;
    }
  });

/**
 * Server-side QR token validation
 * Fetches the latest token and validates against provided token
 */
async function validateQRTokenServer(providedToken) {
  try {
    if (!providedToken || typeof providedToken !== 'string') {
      return {
        isValid: false,
        message: 'No token provided',
        code: 'MISSING_TOKEN'
      };
    }

    const tokenSnapshot = await admin.firestore()
      .collection('qrTokens')
      .orderBy('issuedAt', 'desc')
      .limit(1)
      .get();

    if (tokenSnapshot.empty) {
      return {
        isValid: false,
        message: 'No active QR token found in system',
        code: 'NO_ACTIVE_TOKEN'
      };
    }

    const tokenDoc = tokenSnapshot.docs[0];
    const tokenData = tokenDoc.data();

    if (tokenData.value !== providedToken) {
      return {
        isValid: false,
        message: 'Invalid or expired token',
        code: 'TOKEN_MISMATCH'
      };
    }

    const now = new Date();
    const expiresAt = tokenData.expiresAt ? tokenData.expiresAt.toDate() : null;
    const issuedAt = tokenData.issuedAt ? tokenData.issuedAt.toDate() : null;

    if (expiresAt && now > expiresAt) {
      return {
        isValid: false,
        message: 'Token has expired',
        code: 'TOKEN_EXPIRED'
      };
    }

    if (issuedAt && now < issuedAt) {
      return {
        isValid: false,
        message: 'Token not yet valid',
        code: 'TOKEN_NOT_VALID_YET'
      };
    }

    return {
      isValid: true,
      message: 'Token validation successful',
      code: 'VALID'
    };

  } catch (error) {
    console.error('[Token Validator] Error validating token:', error);
    return {
      isValid: false,
      message: 'Validation error occurred',
      code: 'VALIDATION_ERROR'
    };
  }
}

/**
 * Sends validation notification to user
 */
async function sendTimestampValidationNotification(userId, scheduleId, success, type, message) {
  try {
    const userDoc = await admin.firestore()
      .collection('users')
      .doc(userId)
      .get();

    if (!userDoc.exists) {
      console.log(`[Token Validator] User document not found: ${userId}`);
      return;
    }

    const userData = userDoc.data();
    const notificationMessage = success
      ? `${type === 'check-in' ? 'Check-in' : 'Check-out'} recorded successfully with valid QR code`
      : `${type === 'check-in' ? 'Check-in' : 'Check-out'} attempt rejected: ${message}`;

    const notificationData = {
      privateMessage: notificationMessage,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      type: 'timestamp_validation',
      validationSuccess: success,
      timestampType: type,
      scheduleId: scheduleId,
      read: false
    };

    await admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('PrivateNotification')
      .add(notificationData);

    console.log(`[Token Validator] Notification sent to user ${userId}: ${success ? 'SUCCESS' : 'FAILURE'}`);

    const fcmToken = userData.fcmToken;
    if (fcmToken) {
      const fcmMessage = {
        notification: {
          title: success ? 'Timestamp Validated' : 'Validation Failed',
          body: notificationMessage,
        },
        data: {
          type: 'timestamp_validation',
          validationSuccess: String(success),
          timestampType: type,
          scheduleId: scheduleId,
          timestamp: Date.now().toString()
        },
        token: fcmToken,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'validation_notifications'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };

      await admin.messaging().send(fcmMessage);
      console.log(`[Token Validator] FCM notification sent to user ${userId}`);
    }

  } catch (error) {
    console.error('[Token Validator] Error sending notification:', error);
  }
}

/**
 * Create Admin User
 * 
 * HTTP callable function to create a new user with admin role.
 * This is used during initial setup to create the first administrator.
 * 
 * Required data:
 * - email: Admin user email
 * - password: Admin user password (min 6 characters)
 * - displayName: (optional) Admin display name
 * 
 * Returns: { success: true, uid: string, email: string }
 */
exports.createAdminUser = functions.https.onCall(async (data, context) => {
  try {
    // Validate input
    if (!data.email || !data.password) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Email and password are required'
      );
    }

    if (data.password.length < 6) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Password must be at least 6 characters'
      );
    }

    // Check if this is the first admin (allow creation without auth)
    // Or if caller is already an admin
    const usersSnapshot = await admin.firestore()
      .collection('users')
      .where('role', '==', 'admin')
      .limit(1)
      .get();

    const isFirstAdmin = usersSnapshot.empty;

    // If not first admin, require authenticated admin caller
    if (!isFirstAdmin) {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'Must be authenticated to create admin users'
        );
      }

      const callerToken = await admin.auth().getUser(context.auth.uid);
      const callerClaims = callerToken.customClaims || {};
      
      if (callerClaims.role !== 'admin') {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only admins can create other admin users'
        );
      }
    }

    console.log(`[Admin] Creating admin user: ${data.email}`);

    // Create user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email: data.email,
      password: data.password,
      displayName: data.displayName || 'Administrator',
      emailVerified: false
    });

    console.log(`[Admin] User created with UID: ${userRecord.uid}`);

    // Set admin custom claim
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      role: 'admin',
      createdAt: Date.now()
    });

    console.log(`[Admin] Admin role assigned to UID: ${userRecord.uid}`);

    // Create user document in Firestore
    await admin.firestore()
      .collection('users')
      .doc(userRecord.uid)
      .set({
        email: data.email,
        displayName: data.displayName || 'Administrator',
        role: 'admin',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isFirstAdmin: isFirstAdmin
      });

    console.log(`[Admin] User document created in Firestore`);

    return {
      success: true,
      uid: userRecord.uid,
      email: userRecord.email,
      message: 'Admin user created successfully'
    };

  } catch (error) {
    console.error('[Admin] Error creating admin user:', error);
    
    // Provide user-friendly error messages
    if (error.code === 'auth/email-already-exists') {
      throw new functions.https.HttpsError(
        'already-exists',
        'An account with this email already exists'
      );
    }
    
    if (error.code === 'auth/invalid-email') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid email address format'
      );
    }

    // Re-throw if already an HttpsError
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    // Generic error
    throw new functions.https.HttpsError(
      'internal',
      `Failed to create admin user: ${error.message}`
    );
  }
});

/**
 * Set Admin Role
 * 
 * HTTP callable function to assign admin role to an existing user.
 * Only existing admins can call this function.
 * 
 * Required data:
 * - uid: User ID to grant admin role
 * 
 * Returns: { success: true, uid: string }
 */
exports.setAdminRole = functions.https.onCall(async (data, context) => {
  try {
    // Require authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated to set admin roles'
      );
    }

    // Verify caller is admin
    const callerToken = await admin.auth().getUser(context.auth.uid);
    const callerClaims = callerToken.customClaims || {};
    
    if (callerClaims.role !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can assign admin roles'
      );
    }

    // Validate input
    if (!data.uid) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'User ID (uid) is required'
      );
    }

    console.log(`[Admin] Setting admin role for UID: ${data.uid}`);

    // Verify target user exists
    const targetUser = await admin.auth().getUser(data.uid);
    
    // Set admin custom claim
    await admin.auth().setCustomUserClaims(data.uid, {
      role: 'admin',
      grantedAt: Date.now(),
      grantedBy: context.auth.uid
    });

    console.log(`[Admin] Admin role assigned to UID: ${data.uid}`);

    // Update user document in Firestore
    await admin.firestore()
      .collection('users')
      .doc(data.uid)
      .set({
        role: 'admin',
        roleGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
        roleGrantedBy: context.auth.uid
      }, { merge: true });

    console.log(`[Admin] User document updated in Firestore`);

    return {
      success: true,
      uid: data.uid,
      email: targetUser.email,
      message: 'Admin role assigned successfully'
    };

  } catch (error) {
    console.error('[Admin] Error setting admin role:', error);

    if (error.code === 'auth/user-not-found') {
      throw new functions.https.HttpsError(
        'not-found',
        'User not found with the provided UID'
      );
    }

    // Re-throw if already an HttpsError
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      'internal',
      `Failed to set admin role: ${error.message}`
    );
  }
});

// Utility function to batch delete old notifications
async function deleteOldNotifications(collectionPath, daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const snapshot = await admin.firestore()
    .collectionGroup(collectionPath)
    .where('createdAt', '<', admin.firestore.Timestamp.fromDate(cutoffDate))
    .limit(500) // Process in batches
    .get();
  
  if (snapshot.empty) {
    return 0;
  }
  
  const batch = admin.firestore().batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  
  return snapshot.size;
}
