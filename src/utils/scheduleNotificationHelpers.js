import { 
    collection, 
    addDoc, 
    Timestamp, 
    query, 
    where,
    getDocs,
    doc
} from 'firebase/firestore';
import { dbFirestore } from '../connections/ConnFirebaseServices';
import { differenceInMinutes, parseISO, addHours } from 'date-fns';
import { parseDateTime } from './scheduleUtils';

/**
 * Check if a schedule notification should be created
 * Notifications are created 2 hours before shift start time
 * @param {Object} shift - The shift object with eventDate and startHour
 * @param {string} userId - The user ID
 * @returns {Promise<boolean>} - Returns true if notification was created
 */
export async function checkAndCreateScheduleNotification(shift, userId) {
    if (!shift || !shift.eventDate || !shift.startHour || !userId) {
        return false;
    }

    // Skip continuation fragments
    if (shift.isContinuation) {
        return false;
    }

    try {
        // Parse shift start time
        const shiftStartTime = parseDateTime(shift.eventDate, shift.startHour);
        const now = new Date();

        // Calculate time difference in minutes
        const minutesUntilShift = differenceInMinutes(shiftStartTime, now);

        console.log(`[SCHEDULE NOTIFICATION] Shift ${shift.id || 'unknown'} for user ${userId}: ${minutesUntilShift} minutes until start`);

        // Check if we should create notification:
        // - Shift starts in 5 to 125 minutes (up to 2 hours before, down to 5 minutes before)
        // - This ensures we catch shifts even if monitoring started late
        if (minutesUntilShift >= 5 && minutesUntilShift <= 125) {
            console.log(`[SCHEDULE NOTIFICATION] Shift is within notification window (5-125 minutes)`);
            
            // Check if notification already exists for this shift
            const userDocRef = doc(dbFirestore, 'users', userId);
            const scheduleNotificationRef = collection(userDocRef, 'ScheduleNotification');
            
            const notificationQuery = query(
                scheduleNotificationRef,
                where('shiftId', '==', shift.id || ''),
                where('eventDate', '==', shift.eventDate)
            );

            const existingNotifications = await getDocs(notificationQuery);

            // Only create if notification doesn't exist
            if (existingNotifications.empty) {
                // Calculate hours and minutes for better message
                const hoursUntil = Math.floor(minutesUntilShift / 60);
                const minsUntil = minutesUntilShift % 60;
                let timeMessage = '';
                if (hoursUntil > 0 && minsUntil > 0) {
                    timeMessage = `in ${hoursUntil} hour${hoursUntil > 1 ? 's' : ''} and ${minsUntil} minutes`;
                } else if (hoursUntil > 0) {
                    timeMessage = `in ${hoursUntil} hour${hoursUntil > 1 ? 's' : ''}`;
                } else {
                    timeMessage = `in ${minsUntil} minutes`;
                }
                
                const scheduleMessage = `Reminder: Your shift "${shift.eventDescription}" starts ${timeMessage} at ${shift.startHour} on ${shift.eventDate}`;

                await addDoc(scheduleNotificationRef, {
                    createdAt: Timestamp.now(),
                    scheduleMessage: scheduleMessage,
                    shiftId: shift.id || '',
                    eventDate: shift.eventDate,
                    startHour: shift.startHour,
                    notificationType: 'schedule_reminder'
                });

                console.log(`[SCHEDULE NOTIFICATION] Created for user ${userId}, shift ${shift.id}`);
                return true;
            } else {
                console.log(`[SCHEDULE NOTIFICATION] Notification already exists for shift ${shift.id}`);
            }
        }
        
        return false;
    } catch (error) {
        console.error('[SCHEDULE NOTIFICATION] Error creating notification:', error);
        return false;
    }
}

/**
 * Process all shifts for all users and create notifications as needed
 * This function should be called periodically (e.g., every 5-10 minutes)
 * @param {Array} users - Array of user objects
 * @param {Object} userDailySchedules - Object containing all user schedules grouped by date
 * @returns {Promise<void>}
 */
export async function processScheduleNotifications(users, userDailySchedules) {
    console.log('[SCHEDULE NOTIFICATION] Starting processScheduleNotifications');
    console.log('[SCHEDULE NOTIFICATION] Users count:', users?.length || 0);
    console.log('[SCHEDULE NOTIFICATION] userDailySchedules keys:', Object.keys(userDailySchedules || {}).length);
    
    if (!users || !userDailySchedules) {
        console.log('[SCHEDULE NOTIFICATION] Missing users or schedules data');
        return;
    }

    let totalShiftsChecked = 0;
    let notificationsCreated = 0;

    for (const user of users) {
        if (user.isActive === false) {
            console.log(`[SCHEDULE NOTIFICATION] Skipping inactive user: ${user.id}`);
            continue; // Skip inactive users
        }

        const userSchedules = userDailySchedules[user.id];
        if (!userSchedules) {
            console.log(`[SCHEDULE NOTIFICATION] No schedules found for user: ${user.id}`);
            continue;
        }

        // Process all shifts for this user
        for (const [date, scheduleData] of Object.entries(userSchedules)) {
            if (scheduleData.shifts && Array.isArray(scheduleData.shifts)) {
                console.log(`[SCHEDULE NOTIFICATION] Processing ${scheduleData.shifts.length} shifts for user ${user.id} on ${date}`);
                for (const shift of scheduleData.shifts) {
                    totalShiftsChecked++;
                    const created = await checkAndCreateScheduleNotification(shift, user.id);
                    if (created) notificationsCreated++;
                }
            }
        }
    }

    console.log(`[SCHEDULE NOTIFICATION] Finished processing. Checked ${totalShiftsChecked} shifts, created ${notificationsCreated} notifications`);
}

/**
 * Initialize schedule notification monitoring
 * Sets up periodic checking for shifts that need notifications
 * @param {Array} users - Array of user objects
 * @param {Object} userDailySchedules - Object containing all user schedules
 * @returns {Function} Cleanup function to stop monitoring
 */
export function initializeScheduleNotificationMonitoring(users, userDailySchedules) {
    console.log('[SCHEDULE NOTIFICATION] Initializing monitoring system');
    console.log('[SCHEDULE NOTIFICATION] Users:', users?.length || 0);
    console.log('[SCHEDULE NOTIFICATION] Schedule keys:', Object.keys(userDailySchedules || {}).length);
    
    // Check every 2 minutes for shifts that need notifications
    const intervalId = setInterval(() => {
        console.log('[SCHEDULE NOTIFICATION] Running periodic check...');
        processScheduleNotifications(users, userDailySchedules);
    }, 2 * 60 * 1000); // 2 minutes

    // Run immediately on initialization
    console.log('[SCHEDULE NOTIFICATION] Running initial check...');
    processScheduleNotifications(users, userDailySchedules);

    // Return cleanup function
    return () => {
        console.log('[SCHEDULE NOTIFICATION] Cleaning up monitoring system');
        clearInterval(intervalId);
    };
}
