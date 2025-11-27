/**
 * FCM Token Management Utilities for Web Application
 * 
 * These are OPTIONAL helper functions for the web app to manage FCM tokens.
 * The notification system works WITHOUT these - they're just for enhanced features.
 * 
 * Use cases:
 * - Display list of devices registered per user
 * - Allow users to manage their notification preferences
 * - Admin dashboard to see FCM registration stats
 */

import { doc, updateDoc, getDoc, deleteField } from 'firebase/firestore';
import { dbFirestore } from '../connections/ConnFirebaseServices';

/**
 * Save FCM token to user document
 * Called from mobile app after obtaining FCM token
 * 
 * @param {string} userId - The user ID
 * @param {string} fcmToken - The FCM device token
 * @returns {Promise<boolean>} Success status
 */
export async function saveFCMToken(userId, fcmToken) {
    if (!userId || !fcmToken) {
        console.error('[FCM Web] Invalid userId or token');
        return false;
    }

    try {
        const userRef = doc(dbFirestore, 'users', userId);
        
        await updateDoc(userRef, {
            fcmToken: fcmToken,
            fcmTokenUpdatedAt: new Date(),
            notificationsEnabled: true
        });

        console.log(`[FCM Web] Token saved for user ${userId}`);
        return true;
    } catch (error) {
        console.error('[FCM Web] Error saving FCM token:', error);
        return false;
    }
}

/**
 * Remove FCM token from user document
 * Called when user logs out or disables notifications
 * 
 * @param {string} userId - The user ID
 * @returns {Promise<boolean>} Success status
 */
export async function removeFCMToken(userId) {
    if (!userId) {
        console.error('[FCM Web] Invalid userId');
        return false;
    }

    try {
        const userRef = doc(dbFirestore, 'users', userId);
        
        await updateDoc(userRef, {
            fcmToken: deleteField(),
            notificationsEnabled: false
        });

        console.log(`[FCM Web] Token removed for user ${userId}`);
        return true;
    } catch (error) {
        console.error('[FCM Web] Error removing FCM token:', error);
        return false;
    }
}

/**
 * Check if user has FCM token registered
 * Useful for displaying notification status in UI
 * 
 * @param {string} userId - The user ID
 * @returns {Promise<Object>} Object with hasToken and token info
 */
export async function checkFCMTokenStatus(userId) {
    if (!userId) {
        return { hasToken: false, token: null, updatedAt: null };
    }

    try {
        const userRef = doc(dbFirestore, 'users', userId);
        const userDoc = await getDoc(userRef);

        if (!userDoc.exists()) {
            return { hasToken: false, token: null, updatedAt: null };
        }

        const userData = userDoc.data();
        
        return {
            hasToken: !!userData.fcmToken,
            token: userData.fcmToken || null,
            updatedAt: userData.fcmTokenUpdatedAt || null,
            notificationsEnabled: userData.notificationsEnabled ?? true
        };
    } catch (error) {
        console.error('[FCM Web] Error checking FCM token status:', error);
        return { hasToken: false, token: null, updatedAt: null };
    }
}

/**
 * Update notification preferences for user
 * This doesn't affect Firestore writes, only FCM delivery
 * 
 * @param {string} userId - The user ID
 * @param {boolean} enabled - Whether to enable notifications
 * @returns {Promise<boolean>} Success status
 */
export async function updateNotificationPreferences(userId, enabled) {
    if (!userId) {
        console.error('[FCM Web] Invalid userId');
        return false;
    }

    try {
        const userRef = doc(dbFirestore, 'users', userId);
        
        await updateDoc(userRef, {
            notificationsEnabled: enabled,
            notificationsUpdatedAt: new Date()
        });

        console.log(`[FCM Web] Notifications ${enabled ? 'enabled' : 'disabled'} for user ${userId}`);
        return true;
    } catch (error) {
        console.error('[FCM Web] Error updating notification preferences:', error);
        return false;
    }
}

/**
 * Get FCM statistics for all users (Admin only)
 * Useful for admin dashboard
 * 
 * @param {Array} users - Array of user objects
 * @returns {Object} Statistics about FCM registration
 */
export function getFCMStatistics(users) {
    if (!users || !Array.isArray(users)) {
        return {
            total: 0,
            withToken: 0,
            withoutToken: 0,
            enabled: 0,
            disabled: 0
        };
    }

    const stats = {
        total: users.length,
        withToken: 0,
        withoutToken: 0,
        enabled: 0,
        disabled: 0,
        active: 0,
        inactive: 0
    };

    users.forEach(user => {
        if (user.fcmToken) {
            stats.withToken++;
            if (user.notificationsEnabled !== false) {
                stats.enabled++;
            } else {
                stats.disabled++;
            }
        } else {
            stats.withoutToken++;
        }

        if (user.isActive !== false) {
            stats.active++;
        } else {
            stats.inactive++;
        }
    });

    return stats;
}

/**
 * Validate FCM token format
 * Basic validation before saving
 * 
 * @param {string} token - The FCM token to validate
 * @returns {boolean} Whether token appears valid
 */
export function isValidFCMToken(token) {
    if (!token || typeof token !== 'string') {
        return false;
    }

    // FCM tokens are typically 152+ characters
    if (token.length < 100) {
        return false;
    }

    // Should not contain spaces or special characters except : - _
    const validPattern = /^[A-Za-z0-9:_-]+$/;
    return validPattern.test(token);
}
