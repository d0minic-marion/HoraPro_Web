// Helpers for shift sync (status + totalHoursDay)
// Extracted from AddSchdule.js
import { updateDoc } from 'firebase/firestore';
import { computeWorkedHoursForShift, deriveShiftStatus } from './timeHelpers';

/**
 * Ensure totalHoursDay AND status are up to date for a given shift.
 * Only writes if there's an actual difference from Firestore data.
 */
export async function syncShiftDerivedFieldsIfNeeded(shiftRef, shiftData) {
    const newHours = computeWorkedHoursForShift(shiftData);
    const newStatus = deriveShiftStatus(shiftData);

    const patch = {};
    let needsUpdate = false;

    if (newHours != null) {
        const currentHours = shiftData.totalHoursDay;
        if (
            currentHours === undefined ||
            currentHours === null ||
            Number(currentHours) !== newHours
        ) {
            patch.totalHoursDay = newHours;
            needsUpdate = true;
        }
    }

    const currentStatus = shiftData.status;
    if (currentStatus !== newStatus) {
        patch.status = newStatus;
        needsUpdate = true;
    }

    if (needsUpdate) {
        try {
            await updateDoc(shiftRef, patch);
        } catch (err) {
            console.error('Failed to sync shift fields:', err);
        }
    }
}
