import { differenceInMinutes, isAfter, isBefore, addDays } from 'date-fns';

/**
 * Creates a Date object from a date string without timezone issues
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {Date} - Date object in local timezone
 */
export function parseDate(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day); // month is 0-indexed
}

/**
 * Creates a Date object with time from date and time strings
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @param {string} timeString - Time in HH:MM format
 * @returns {Date} - Date object with time set
 */
export function parseDateTime(dateString, timeString) {
    const [year, month, day] = dateString.split('-').map(Number);
    const [hours, minutes] = timeString.split(':').map(Number);
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

/**
 * Calculates worked hours for a shift using timestamps if available, otherwise falls back to string times.
 * Supports overnight shifts (checkout next day).
 * @param {Object} shift
 * @returns {number} hours (rounded to 2 decimals)
 */
export function computeWorkedHours(shift) {
    try {
        // Prefer Firestore timestamps if present
        let checkInTs = null;
        let checkOutTs = null;
        if (shift?.checkInTimestamp) {
            if (shift.checkInTimestamp instanceof Date) checkInTs = shift.checkInTimestamp; else if (typeof shift.checkInTimestamp.toDate === 'function') checkInTs = shift.checkInTimestamp.toDate();
        }
        if (shift?.checkOutTimestamp) {
            if (shift.checkOutTimestamp instanceof Date) checkOutTs = shift.checkOutTimestamp; else if (typeof shift.checkOutTimestamp.toDate === 'function') checkOutTs = shift.checkOutTimestamp.toDate();
        }
        if (checkInTs && checkOutTs) {
            let minutes = differenceInMinutes(checkOutTs, checkInTs);
            if (minutes > 0) return +(minutes / 60).toFixed(2);
        }
    // Fallback to stored times
        if (shift?.checkedInTime && shift?.checkedOutTime && shift?.eventDate) {
            let start = parseDateTime(shift.eventDate, shift.checkedInTime);
            let end = parseDateTime(shift.eventDate, shift.checkedOutTime);
            if (end <= start) {
                // assume overnight
                end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
            }
            let minutes = differenceInMinutes(end, start);
            if (minutes > 0) return +(minutes / 60).toFixed(2);
        }
    } catch (e) {
    // ignore
    }
    return 0;
}

/**
 * Calculates month-to-date totals (scheduled & worked) up to the provided reference date (inclusive).
 * Only completed shifts (with valid worked hours > 0) contribute to workedHours.
 * @param {Array} shifts - All user shifts
 * @param {Date} referenceDate - Date boundary (defaults to now)
 * @returns {{workedHours:number, scheduledHours:number, completedShifts:number, consideredShifts:number}}
 */
export function computeMonthToDateTotals(shifts, referenceDate = new Date()) {
    if (!Array.isArray(shifts) || shifts.length === 0) {
        return { workedHours: 0, scheduledHours: 0, completedShifts: 0, consideredShifts: 0 };
    }
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();
    const startOfMonth = new Date(year, month, 1);
    let worked = 0;
    let scheduled = 0;
    let completed = 0;
    let considered = 0;

    shifts.forEach(shift => {
        if (!shift?.eventDate) return;
        try {
            const shiftDate = parseDate(shift.eventDate);
            if (shiftDate >= startOfMonth && shiftDate <= referenceDate) {
                considered++;
                // scheduled hours precision minutes
                try {
                    const start = parseDateTime(shift.eventDate, shift.startHour);
                    const end = parseDateTime(shift.eventDate, shift.endHour);
                    const mins = differenceInMinutes(end, start);
                    if (mins > 0) scheduled += mins / 60;
                } catch {/* ignore */}
                const wh = computeWorkedHours(shift);
                if (wh > 0) {
                    worked += wh;
                    completed++;
                }
            }
    } catch {/* ignore one shift */}
    });

    return {
        workedHours: +worked.toFixed(2),
        scheduledHours: +scheduled.toFixed(2),
        completedShifts: completed,
        consideredShifts: considered
    };
}

/**
 * Checks if two time ranges overlap
 * @param {string} start1 - Start time of first range (HH:MM format)
 * @param {string} end1 - End time of first range (HH:MM format)
 * @param {string} start2 - Start time of second range (HH:MM format)
 * @param {string} end2 - End time of second range (HH:MM format)
 * @param {string} date - Date for the shifts (YYYY-MM-DD format)
 * @returns {boolean} - True if ranges overlap
 */
export const doTimeRangesOverlap = (start1, end1, start2, end2, date) => {
    try {
        const startTime1 = parseDateTime(date, start1);
        const endTime1 = parseDateTime(date, end1);
        const startTime2 = parseDateTime(date, start2);
        const endTime2 = parseDateTime(date, end2);

        // Check for overlap: start1 < end2 && start2 < end1
        return isBefore(startTime1, endTime2) && isBefore(startTime2, endTime1);
    } catch (error) {
    console.error('Error checking time overlap:', error);
        return false;
    }
};

/**
 * Validates a new shift against existing shifts for the same day
 * @param {string} newStartTime - New shift start time (HH:MM)
 * @param {string} newEndTime - New shift end time (HH:MM)
 * @param {string} date - Date of the shift (YYYY-MM-DD)
 * @param {Array} existingShifts - Array of existing shifts for the same day
 * @param {string} excludeShiftId - ID of shift to exclude from validation (for editing)
 * @returns {Object} - Validation result with isValid boolean and message
 */
export const validateShiftOverlap = (newStartTime, newEndTime, date, existingShifts, excludeShiftId = null, options = {}) => {
    const { allowOvernight = false, maxHours = 16 } = options;
    try {
        // First, validate the new shift times
        const newStart = new Date(`${date}T${newStartTime}`);
        let newEnd = new Date(`${date}T${newEndTime}`);

        let overnight = false;
        if (!isAfter(newEnd, newStart)) {
            if (allowOvernight) {
                // treat as next day end
                newEnd = new Date(newEnd.getTime() + 24 * 60 * 60 * 1000);
                overnight = true;
            } else {
                return {
                    isValid: false,
                    message: 'End time must be after start time',
                    type: 'time_invalid'
                };
            }
        }

        // Check duration (max 12 hours per shift)
        const durationMinutes = differenceInMinutes(newEnd, newStart);
        if (durationMinutes > maxHours * 60) {
            return {
                isValid: false,
                message: `A shift cannot last more than ${maxHours} hours`,
                type: 'duration_exceeded'
            };
        }

        // Check for overlaps with existing shifts
        const overlappingShifts = existingShifts.filter(shift => {
            // Exclude the current shift if we're editing
            if (excludeShiftId && shift.id === excludeShiftId) {
                return false;
            }
            // Build interval for existing shift (support its own overnight if previously stored)
            const existStart = new Date(`${shift.eventDate}T${shift.startHour}`);
            let existEnd = new Date(`${shift.eventDate}T${shift.endHour}`);
            if (shift.endDate && shift.endDate !== shift.eventDate) {
                // stored cross-day
                existEnd = new Date(`${shift.endDate}T${shift.endHour}`);
            } else if (existEnd <= existStart) {
                existEnd = new Date(existEnd.getTime() + 24 * 60 * 60 * 1000);
            }
            return (newStart < existEnd) && (existStart < newEnd);
        });

        if (overlappingShifts.length > 0) {
            const conflictShift = overlappingShifts[0];
            return {
                isValid: false,
                message: `The shift overlaps with another existing shift (${conflictShift.startHour} - ${conflictShift.endHour}: ${conflictShift.eventDescription})`,
                type: 'overlap_conflict',
                conflictingShift: conflictShift
            };
        }

        // Check total daily hours (max 16 hours per day including new shift)
        const totalDailyMinutes = existingShifts
            .filter(shift => excludeShiftId ? shift.id !== excludeShiftId : true)
            .reduce((total, shift) => {
                const start = new Date(`${shift.eventDate}T${shift.startHour}`);
                let end = new Date(`${shift.eventDate}T${shift.endHour}`);
                if (shift.endDate && shift.endDate !== shift.eventDate) {
                    end = new Date(`${shift.endDate}T${shift.endHour}`);
                } else if (end <= start) {
                    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
                }
                // Only count portion of cross-midnight shift that falls on original date for daily total
                if (start.toDateString() !== new Date(date).toDateString()) return total; // safety
                let effectiveEnd = end;
                if (end.toDateString() !== start.toDateString()) {
                    // clamp at midnight
                    effectiveEnd = addDays(new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59), 0);
                }
                return total + differenceInMinutes(effectiveEnd, start);
            }, 0) + Math.min(durationMinutes, overnight ? differenceInMinutes(new Date(`${date}T23:59:59`), newStart) : durationMinutes);

        if (totalDailyMinutes > 960) { // 16 hours = 960 minutes
            return {
                isValid: false,
                message: `Total shift time for this day would exceed the allowed 16 hours (current: ${Math.round(totalDailyMinutes / 60 * 100) / 100}h)`,
                type: 'daily_limit_exceeded'
            };
        }

        return {
            isValid: true,
            message: overnight ? 'Valid shift (crosses midnight)' : 'Valid shift',
            totalDailyHours: Math.round(totalDailyMinutes / 60 * 100) / 100,
            overnight
        };

    } catch (error) {
        console.error('Error validating shift:', error);
        return {
            isValid: false,
            message: 'Error validating shift',
            type: 'validation_error'
        };
    }
};

/**
 * Calculates total hours for all shifts on a specific day
 * @param {Array} shifts - Array of shifts for the day
 * @returns {Object} - Object with scheduled and worked hours totals
 */
export const calculateDailyTotals = (shifts) => {
    const totals = {
        scheduledHours: 0,
        workedHours: 0,
        totalShifts: shifts.length,
        completedShifts: 0,
        inProgressShifts: 0,
        pendingShifts: 0
    };

    shifts.forEach(shift => {
        try {
            // Scheduled hours contribution (already split via continuation fragment if needed)
            let startTime = new Date(`${shift.eventDate}T${shift.startHour}`);
            let endTime = new Date(`${shift.eventDate}T${shift.endHour}`);
            // Guard for continuation fragments: treat as same-day straightforward
            if (!shift.isContinuation) {
                // If original shift crosses midnight but not using endDate (legacy), end could be <= start; adjust only for first-day portion
                if ((shift.endDate && shift.endDate !== shift.eventDate) || endTime <= startTime) {
                    // First day portion is until 23:59 of eventDate
                    const dayEnd = new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate(), 23, 59, 59, 999);
                    if (endTime <= startTime) {
                        // reconstruct real end by adding 24h
                        const realEnd = new Date(endTime.getTime() + 24 * 60 * 60 * 1000);
                        endTime = dayEnd < realEnd ? dayEnd : realEnd; // clamp to day end
                    } else if (shift.endDate && shift.endDate !== shift.eventDate) {
                        // endTime belongs to next day; clamp
                        endTime = dayEnd;
                    }
                }
            }
            const scheduledMinutes = Math.max(0, differenceInMinutes(endTime, startTime));
            totals.scheduledHours += scheduledMinutes / 60;
        } catch (error) {
            console.error('Error calculating scheduled hours for shift:', shift.id, error);
        }

        // Worked hours contribution
        if (shift.isContinuation) {
            // Continuation fragment carries only second-day worked minutes (if any)
            if (typeof shift.continuationWorkedMinutes === 'number' && shift.continuationWorkedMinutes > 0) {
                totals.workedHours += +(shift.continuationWorkedMinutes / 60).toFixed(2);
                totals.completedShifts += shift.continuationWorkedMinutes > 0 ? 0 : 0; // continuation does not alter counts independently
            }
        } else if (shift.checkedInTime && shift.checkedOutTime) {
            if (typeof shift.firstDayWorkedMinutes === 'number') {
                const workedHours = +(shift.firstDayWorkedMinutes / 60).toFixed(2);
                if (workedHours > 0) {
                    totals.workedHours += workedHours;
                    totals.completedShifts++;
                }
            } else {
                const workedHours = computeWorkedHours(shift);
                if (workedHours > 0) {
                    totals.workedHours += workedHours;
                    totals.completedShifts++;
                }
            }
        } else if (shift.checkedInTime && !shift.checkedOutTime) {
            totals.inProgressShifts++;
        } else {
            totals.pendingShifts++;
        }
    });

    // Round to 2 decimal places
    totals.scheduledHours = Math.round(totals.scheduledHours * 100) / 100;
    totals.workedHours = Math.round(totals.workedHours * 100) / 100;

    return totals;
};

/**
 * Groups shifts by date and calculates daily totals
 * @param {Array} allShifts - All shifts for a user
 * @returns {Object} - Object grouped by date with daily totals
 */
export const groupShiftsByDate = (allShifts) => {
    const grouped = {};

    // Helper to ensure date key
    const ensureDateGroup = (date) => {
        if (!grouped[date]) {
            grouped[date] = { shifts: [], totals: null };
        }
    };

    allShifts.forEach(shift => {
        ensureDateGroup(shift.eventDate);
        grouped[shift.eventDate].shifts.push(shift);
    });

    // Second pass: create continuation fragments for cross-midnight shifts
    const fragments = [];
    allShifts.forEach(shift => {
        try {
            const crossesMidnight = Boolean(
                (shift.endDate && shift.endDate !== shift.eventDate) ||
                (!shift.endDate && shift.endHour && shift.startHour && shift.endHour <= shift.startHour) ||
                shift.overnight
            );
            if (!crossesMidnight) return;

            // Determine next date
            const [y, m, d] = shift.eventDate.split('-').map(Number);
            const startDateObj = new Date(y, m - 1, d);
            const nextDateObj = addDays(startDateObj, 1);
            const nextDateStr = `${nextDateObj.getFullYear()}-${String(nextDateObj.getMonth()+1).padStart(2,'0')}-${String(nextDateObj.getDate()).padStart(2,'0')}`;
            ensureDateGroup(nextDateStr);

            // Compute worked hour splitting if possible
            let firstDayWorkedMinutes = null;
            let secondDayWorkedMinutes = null;
            try {
                // Actual start & end for worked calculation
                let checkIn = shift.checkInTimestamp ? (typeof shift.checkInTimestamp.toDate === 'function' ? shift.checkInTimestamp.toDate() : shift.checkInTimestamp) : null;
                let checkOut = shift.checkOutTimestamp ? (typeof shift.checkOutTimestamp.toDate === 'function' ? shift.checkOutTimestamp.toDate() : shift.checkOutTimestamp) : null;
                if (!checkIn && shift.checkedInTime) {
                    checkIn = parseDateTime(shift.eventDate, shift.checkedInTime);
                }
                if (!checkOut && shift.checkedOutTime) {
                    // If endDate provided use it
                    const endDateStr = shift.endDate && shift.endDate !== shift.eventDate ? shift.endDate : shift.eventDate;
                    checkOut = parseDateTime(endDateStr, shift.checkedOutTime);
                    if (checkOut <= checkIn) {
                        checkOut = new Date(checkOut.getTime() + 24*60*60*1000);
                    }
                }
                if (checkIn && checkOut) {
                    const midnight = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate()+1, 0,0,0,0);
                    const totalMinutes = differenceInMinutes(checkOut, checkIn);
                    const firstMinutes = Math.max(0, differenceInMinutes(Math.min(checkOut.getTime(), midnight.getTime()), checkIn));
                    const secondMinutes = Math.max(0, totalMinutes - firstMinutes);
                    firstDayWorkedMinutes = firstMinutes;
                    secondDayWorkedMinutes = secondMinutes;
                    // Attach first day portion to original shift
                    shift.firstDayWorkedMinutes = firstDayWorkedMinutes;
                }
            } catch {/* ignore splitting errors */}

            fragments.push({
                id: `${shift.id}__cont`,
                eventDate: nextDateStr,
                startHour: '00:00',
                endHour: shift.endHour,
                endDate: shift.endDate && shift.endDate !== shift.eventDate ? shift.endDate : nextDateStr,
                eventDescription: `${shift.eventDescription} (cont.)`,
                isContinuation: true,
                baseShiftId: shift.id,
                checkedInTime: '',
                checkedOutTime: '',
                continuationWorkedMinutes: secondDayWorkedMinutes,
                originalStartDate: shift.eventDate
            });
        } catch {/* ignore per shift errors */}
    });

    // Insert fragments
    fragments.forEach(f => {
        ensureDateGroup(f.eventDate);
        grouped[f.eventDate].shifts.push(f);
    });

    // Calculate totals for each day
    Object.keys(grouped).forEach(date => {
        grouped[date].totals = calculateDailyTotals(grouped[date].shifts);
        // Round after aggregation
        grouped[date].totals.scheduledHours = Math.round(grouped[date].totals.scheduledHours * 100) / 100;
        grouped[date].totals.workedHours = Math.round(grouped[date].totals.workedHours * 100) / 100;
    });

    return grouped;
};

/**
 * Formats time duration from minutes to hours and minutes
 * @param {number} minutes - Duration in minutes
 * @returns {string} - Formatted duration (e.g., "8h 30m")
 */
export const formatDuration = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours === 0) {
        return `${remainingMinutes}m`;
    } else if (remainingMinutes === 0) {
        return `${hours}h`;
    } else {
        return `${hours}h ${remainingMinutes}m`;
    }
};

/**
 * Suggests optimal break time between shifts
 * @param {string} endTime1 - End time of first shift (HH:MM)
 * @param {string} startTime2 - Start time of second shift (HH:MM)
 * @param {string} date - Date of shifts (YYYY-MM-DD)
 * @returns {Object} - Break information
 */
export const calculateBreakTime = (endTime1, startTime2, date) => {
    try {
        const end1 = new Date(`${date}T${endTime1}`);
        const start2 = new Date(`${date}T${startTime2}`);
        
        const breakMinutes = differenceInMinutes(start2, end1);
        
        return {
            breakMinutes,
            breakFormatted: formatDuration(breakMinutes),
            isAdequate: breakMinutes >= 30, // Minimum 30 minutes break recommended
            recommendation: breakMinutes < 30 ? 
                'A minimum break of 30 minutes between shifts is recommended' : 
                'Adequate break time'
        };
    } catch (error) {
    console.error('Error calculating break time:', error);
        return {
            breakMinutes: 0,
            breakFormatted: '0m',
            isAdequate: false,
            recommendation: 'Error calculating break time'
        };
    }
};

/**
 * Gets shift status with color and icon
 * @param {Object} shift - Shift object
 * @returns {Object} - Status information
 */
export const getShiftStatus = (shift) => {
    const now = new Date();
    const endTime = new Date(`${shift.eventDate}T${shift.endHour}`);
    const startTime = new Date(`${shift.eventDate}T${shift.startHour}`);

    if (shift.checkedInTime && shift.checkedOutTime) {
        return { 
            status: 'completed', 
            label: 'Completed', 
            color: 'success',
            bgColor: 'bg-green-100',
            textColor: 'text-green-800'
        };
    } else if (shift.checkedInTime && !shift.checkedOutTime) {
        return { 
            status: 'in-progress', 
            label: 'In Progress', 
            color: 'warning',
            bgColor: 'bg-yellow-100',
            textColor: 'text-yellow-800'
        };
    } else if (now > endTime) {
        return { 
            status: 'missed', 
            label: 'Missed', 
            color: 'danger',
            bgColor: 'bg-red-100',
            textColor: 'text-red-800'
        };
    } else if (now >= startTime && now <= endTime) {
        return { 
            status: 'current', 
            label: 'Current', 
            color: 'primary',
            bgColor: 'bg-blue-100',
            textColor: 'text-blue-800'
        };
    } else {
        return { 
            status: 'scheduled', 
            label: 'Scheduled', 
            color: 'secondary',
            bgColor: 'bg-gray-100',
            textColor: 'text-gray-800'
        };
    }
};
