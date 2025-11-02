import { updateDoc } from 'firebase/firestore';

/**
 * Get hours difference between two JS Date objects, in decimal hours.
 */
function diffHours(dateStart, dateEnd) {
  const ms = dateEnd.getTime() - dateStart.getTime();
  return ms / (1000 * 60 * 60);
}

/**
 * Parse "HH:mm" (e.g. "22:30") into {h, m}.
 */
function parseHHMM(str) {
  if (!str || typeof str !== 'string') return null;
  const [h, m] = str.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return { h, m };
}

/**
 * Compute worked hours using the most reliable source available.
 * Priority:
 *   1. checkInTimestamp / checkOutTimestamp (full timestamp)
 *   2. checkedInTime / checkedOutTime (+ overnight flag) as fallback
 *
 * Returns a number (hours, float with decimals) or null if cannot compute.
 */
function computeWorkedHoursForShift(shiftData) {
  const {
    checkInTimestamp,
    checkOutTimestamp,
    checkedInTime,
    checkedOutTime,
    overnight,
  } = shiftData || {};

  // 1. Use timestamps if both present
  if (checkInTimestamp && checkOutTimestamp &&
      checkInTimestamp.toDate && checkOutTimestamp.toDate) {
    const startDate = checkInTimestamp.toDate();
    const endDate = checkOutTimestamp.toDate();
    const hours = diffHours(startDate, endDate);
    if (hours >= 0) return Number(hours.toFixed(2));
  }

  // 2. Fallback: use HH:mm strings if both present
  const startParsed = parseHHMM(checkedInTime);
  const endParsed   = parseHHMM(checkedOutTime);

  if (startParsed && endParsed) {
    let startTotalMin = startParsed.h * 60 + startParsed.m;
    let endTotalMin   = endParsed.h * 60 + endParsed.m;

    // Overnight logic: if flagged or implied wrap
    if ((overnight === true) && endTotalMin < startTotalMin) {
      endTotalMin += 24 * 60;
    }

    const diffMin = endTotalMin - startTotalMin;
    if (diffMin >= 0) {
      const hours = diffMin / 60;
      return Number(hours.toFixed(2));
    }
  }

  // cannot compute
  return null;
}

/**
 * Ensure that totalHoursDay in Firestore is up to date with source fields.
 * - shiftRef: DocumentReference to users/{uid}/UserSchedule/{shiftId}
 * - shiftData: data() from that shift
 */
export async function syncTotalHoursDayIfNeeded(shiftRef, shiftData) {
  const newHours = computeWorkedHoursForShift(shiftData);
  if (newHours == null) {
    // not enough info to compute
    return;
  }

  const currentValue = shiftData.totalHoursDay;

  // Only write if different or missing:
  // avoids write loops and excessive updates
  if (currentValue === undefined || currentValue === null || Number(currentValue) !== newHours) {
    try {
      await updateDoc(shiftRef, {
        totalHoursDay: newHours,
      });
      // We purposely do NOT toast here because this should be silent,
      // and we do NOT touch UI.
    } catch (err) {
      console.error('Failed to sync totalHoursDay for shift', err);
    }
  }
}
