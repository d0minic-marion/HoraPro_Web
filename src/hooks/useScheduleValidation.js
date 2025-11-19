import { useState, useEffect } from 'react';
import { validateShiftOverlap } from '../utils/scheduleUtils';

/**
 * Custom hook for real-time schedule validation
 * Validates shift overlap when form fields change
 * @param {string} eventDate - Date of the event
 * @param {string} startHour - Start time
 * @param {string} endHour - End time
 * @param {string} selectedUserId - Selected user ID
 * @param {Object} userDailySchedules - Object with daily schedules by user and date
 * @param {boolean} endsNextDay - Whether shift ends next day (overnight)
 * @returns {Object|null} - Validation result object or null
 */
function useScheduleValidation(eventDate, startHour, endHour, selectedUserId, userDailySchedules, endsNextDay) {
    const [validationResult, setValidationResult] = useState(null);

    useEffect(() => {
        if (eventDate && startHour && endHour && selectedUserId) {
            const userDailyData = userDailySchedules[selectedUserId];
            const existingShiftsForDate = userDailyData && userDailyData[eventDate]
                ? userDailyData[eventDate].shifts
                : [];

            const validation = validateShiftOverlap(
                startHour, 
                endHour, 
                eventDate, 
                existingShiftsForDate,
                null,
                { allowOvernight: endsNextDay, maxHours: 16 }
            );

            setValidationResult(validation);
        } else {
            setValidationResult(null);
        }
    }, [eventDate, startHour, endHour, selectedUserId, userDailySchedules, endsNextDay]);

    return validationResult;
}

export default useScheduleValidation;
