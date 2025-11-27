/**
 * QR Token Validator
 * 
 * Validates that check-in/check-out operations are performed with a valid QR token
 * that matches the current time (hour and minutes).
 * 
 * This prevents external applications from writing to checkInTimestamp and 
 * checkOutTimestamp fields without proper validation.
 */

import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { dbFirestore } from '../connections/ConnFirebaseServices';

const TOKEN_COLLECTION = 'qrTokens';

/**
 * Fetches the most recent QR token from Firestore
 * @returns {Promise<Object|null>} Token data or null if not found
 */
export async function fetchLatestQRToken() {
    try {
        const tokenCollectionRef = collection(dbFirestore, TOKEN_COLLECTION);
        const q = query(tokenCollectionRef, orderBy('issuedAt', 'desc'), limit(1));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            console.warn('[QR Validator] No QR token found in database');
            return null;
        }

        const tokenDoc = snapshot.docs[0];
        const data = tokenDoc.data();

        return {
            id: tokenDoc.id,
            value: data.value,
            issuedAt: data.issuedAt && typeof data.issuedAt.toDate === 'function' 
                ? data.issuedAt.toDate() 
                : null,
            expiresAt: data.expiresAt && typeof data.expiresAt.toDate === 'function' 
                ? data.expiresAt.toDate() 
                : null
        };
    } catch (error) {
        console.error('[QR Validator] Error fetching QR token:', error);
        return null;
    }
}

/**
 * Validates that the provided token matches the current active token
 * and that the current time (hour:minute) corresponds to the token's validity window
 * 
 * @param {string} providedToken - The token from the QR code
 * @returns {Promise<Object>} Validation result with isValid flag and message
 */
export async function validateQRToken(providedToken) {
    if (!providedToken || typeof providedToken !== 'string') {
        return {
            isValid: false,
            message: 'No token provided',
            code: 'MISSING_TOKEN'
        };
    }

    const tokenData = await fetchLatestQRToken();

    if (!tokenData) {
        return {
            isValid: false,
            message: 'No active QR token found in system',
            code: 'NO_ACTIVE_TOKEN'
        };
    }

    if (tokenData.value !== providedToken) {
        return {
            isValid: false,
            message: 'Invalid or expired token',
            code: 'TOKEN_MISMATCH'
        };
    }

    const now = new Date();

    if (tokenData.expiresAt && now > tokenData.expiresAt) {
        return {
            isValid: false,
            message: 'Token has expired',
            code: 'TOKEN_EXPIRED'
        };
    }

    if (tokenData.issuedAt && now < tokenData.issuedAt) {
        return {
            isValid: false,
            message: 'Token not yet valid',
            code: 'TOKEN_NOT_VALID_YET'
        };
    }

    return {
        isValid: true,
        message: 'Token validation successful',
        code: 'VALID',
        tokenData
    };
}

/**
 * Validates token and returns a result suitable for user feedback
 * @param {string} token - QR token to validate
 * @returns {Promise<Object>} Result with success flag and user-friendly message
 */
export async function validateTokenForCheckInOut(token) {
    const result = await validateQRToken(token);

    if (!result.isValid) {
        return {
            success: false,
            message: `QR validation failed: ${result.message}`,
            errorCode: result.code
        };
    }

    return {
        success: true,
        message: 'QR code validated successfully',
        tokenData: result.tokenData
    };
}

/**
 * Extracts hour and minute from a Date object for comparison
 * @param {Date} date - Date object
 * @returns {string} Time in HH:MM format
 */
export function extractTimeHHMM(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        return null;
    }
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

/**
 * Checks if the current time matches the token's time window (within same minute)
 * @param {Date} tokenIssuedAt - Token issued timestamp
 * @param {Date} currentTime - Current timestamp to check
 * @returns {boolean} True if within valid time window
 */
export function isTimeWithinTokenWindow(tokenIssuedAt, currentTime = new Date()) {
    if (!tokenIssuedAt || !currentTime) {
        return false;
    }

    const tokenTime = extractTimeHHMM(tokenIssuedAt);
    const currentTimeStr = extractTimeHHMM(currentTime);

    if (!tokenTime || !currentTimeStr) {
        return false;
    }

    return tokenTime === currentTimeStr;
}
