// Helpers for time and hours calculations
// Extracted from AddSchdule.js

import { differenceInMinutes, addDays, format } from 'date-fns';
import { parseDate, parseDateTime } from './scheduleUtils';

/**
 * Parse multiple possible time formats into { h, m }.
 * Supports:
 *  - "03:00", "3:00"
 *  - "22:15"
 *  - "3.00" -> 03:00
 *  - "10.5" -> 10:30
 *  - "7"    -> 07:00
 */
export function parseHHMM(str) {
    if (!str || typeof str !== 'string') return null;

    // Case 1: "HH:mm" or "H:mm"
    if (str.includes(':')) {
        const [h, m] = str.split(':').map(Number);
        if (isNaN(h) || isNaN(m)) return null;
        return { h, m };
    }

    // Case 2: "H.mm" / "HH.mm" e.g. "3.00", "10.25", "10.5"
    if (str.includes('.')) {
        const [hRaw, mRaw] = str.split('.');
        const h = Number(hRaw);

        let m;
        if (mRaw === undefined || mRaw === '') {
            m = 0;
        } else if (/^\d{2}$/.test(mRaw)) {
            // "3.05" -> 5 min, "3.30" -> 30 min
            m = Number(mRaw);
        } else {
            // "10.5" => "0.5h" => 30 min
            const frac = Number("0." + mRaw);
            if (isNaN(frac)) return null;
            m = Math.round(frac * 60);
        }

        if (isNaN(h) || isNaN(m)) return null;
        if (m < 0 || m >= 60) return null;

        return { h, m };
    }

    // Case 3: just "H" -> assume ":00"
    if (!isNaN(Number(str))) {
        const h = Number(str);
        const m = 0;
        return { h, m };
    }

    return null;
}

/**
 * Return difference in hours between two Date objects, with decimals.
 */
export function diffHours(dateStart, dateEnd) {
    const ms = dateEnd.getTime() - dateStart.getTime();
    return ms / (1000 * 60 * 60);
}

/**
 * Compute worked hours for a shift using the best available data.
 * Priority:
 * 1. checkInTimestamp / checkOutTimestamp
 * 2. checkedInTime / checkedOutTime (+ overnight)
 *
 * Returns number (2 decimals) or null.
 */
export function computeWorkedHoursForShift(shiftData) {
    if (!shiftData) return null;

    const {
        checkInTimestamp,
        checkOutTimestamp,
        checkedInTime,
        checkedOutTime,
        overnight,
        eventDate,
        endDate
    } = shiftData;

    // 1. Highest priority: Timestamp pair
    if (checkInTimestamp && checkOutTimestamp) {
        const startDate =
            typeof checkInTimestamp?.toDate === 'function'
                ? checkInTimestamp.toDate()
                : (checkInTimestamp instanceof Date ? checkInTimestamp : null);
        const endDateObj =
            typeof checkOutTimestamp?.toDate === 'function'
                ? checkOutTimestamp.toDate()
                : (checkOutTimestamp instanceof Date ? checkOutTimestamp : null);

        if (startDate && endDateObj) {
            const hours = diffHours(startDate, endDateObj);
            if (hours >= 0) {
                return Number(hours.toFixed(2));
            }
        }
    }

    // 2. Fallback: eventDate + HH:mm strings
    if (eventDate && checkedInTime && checkedOutTime) {
        try {
            const start = parseDateTime(eventDate, checkedInTime);
            let endDateStr = (endDate && endDate !== eventDate) ? endDate : eventDate;
            let end = parseDateTime(endDateStr, checkedOutTime);

            if (overnight || end <= start) {
                if (!endDate || endDate === eventDate) {
                    endDateStr = format(addDays(parseDate(eventDate), 1), 'yyyy-MM-dd');
                    end = parseDateTime(endDateStr, checkedOutTime);
                }
            }

            const minutes = differenceInMinutes(end, start);
            if (minutes >= 0) {
                return Number((minutes / 60).toFixed(2));
            }
        } catch {
            // fall through to legacy HH:mm parsing
        }
    }

    // 3. Legacy fallback: HH:mm style without dates
    const startParsed = parseHHMM(checkedInTime);
    const endParsed = parseHHMM(checkedOutTime);

    if (startParsed && endParsed) {
        let startTotalMin = startParsed.h * 60 + startParsed.m;
        let endTotalMin = endParsed.h * 60 + endParsed.m;

        if (overnight === true && endTotalMin < startTotalMin) {
            endTotalMin += 24 * 60;
        }

        const diffMin = endTotalMin - startTotalMin;
        if (diffMin >= 0) {
            const hours = diffMin / 60;
            return Number(hours.toFixed(2));
        }
    }

    return null;
}

/**
 * Derive the appropriate status for a shift based on its data.
 * Rules:
 * - If both checkin + checkout present -> "completed"
 * - Else if has checkIn but no checkOut -> "in_progress"
 * - Else -> "scheduled"
 */
export function deriveShiftStatus(shiftData) {
    const { checkedInTime, checkedOutTime, checkInTimestamp, checkOutTimestamp } = shiftData || {};

    const hasIn  = !!checkedInTime || !!checkInTimestamp;
    const hasOut = !!checkedOutTime || !!checkOutTimestamp;

    if (hasIn && hasOut) return 'completed';
    if (hasIn && !hasOut) return 'in_progress';
    return 'scheduled';
}


