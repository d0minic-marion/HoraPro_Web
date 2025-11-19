import { useEffect, useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { dbFirestore } from '../connections/ConnFirebaseServices';
import { loadWageHistory, getRateForDate } from '../utils/earningsHelpers';

/**
 * Custom hook to calculate and sync daily earnings to RecordEarnings collection
 * @param {string} userId - The user ID
 * @param {Object} userData - User data including hourlyWage
 * @param {Object} groupedSchedules - Schedules grouped by date
 * @param {Object} overtimeSettings - Overtime configuration
 * @returns {Object} Earnings cache state
 */
export function useEarningsCalculation(userId, userData, groupedSchedules, overtimeSettings) {
    const [earningsCache, setEarningsCache] = useState({});

    useEffect(() => {
        if (!userId || !userData || !userData.hourlyWage) return;
        if (!groupedSchedules || Object.keys(groupedSchedules).length === 0) return;

        (async () => {
            const fallbackRate = parseFloat(userData.hourlyWage) || 0;
            if (fallbackRate <= 0) return;

            const threshold = parseFloat(overtimeSettings.thresholdHours) || 9999;
            const overtimePercent = parseFloat(overtimeSettings.overtimePercent) || 0;
            const overtimeMultiplier = 1 + (overtimePercent / 100);

            const newCache = { ...earningsCache };
            const writes = [];

            const allDates = Object.keys(groupedSchedules).sort();
            const historyRates = await loadWageHistory(userId);

            // Group dates by week for cumulative overtime calculation
            const weekMap = {};
            allDates.forEach(dateKey => {
                const [y, m, d] = dateKey.split('-').map(Number);
                const dateObj = new Date(y, m - 1, d);
                const tmp = new Date(dateObj.getTime());
                const day = (tmp.getDay() + 6) % 7; // Monday=0 ... Sunday=6
                tmp.setDate(tmp.getDate() - day); // week start (Monday)
                const wkYear = tmp.getFullYear();
                const jan1 = new Date(wkYear, 0, 1);
                const daysDiff = Math.floor((tmp - jan1) / (24 * 3600 * 1000));
                const weekNum = Math.floor(daysDiff / 7) + 1;
                const weekKey = `${wkYear}-W${String(weekNum).padStart(2, '0')}`;
                if (!weekMap[weekKey]) weekMap[weekKey] = [];
                weekMap[weekKey].push(dateKey);
            });

            // Process each week
            Object.keys(weekMap).forEach(weekKey => {
                let cumulativeWeekHours = 0;

                weekMap[weekKey].forEach(dateKey => {
                    const dayGroup = groupedSchedules[dateKey];
                    if (!dayGroup?.totals) return;

                    const worked = parseFloat(dayGroup.totals.workedHours || 0);
                    const scheduledHours = +(parseFloat(dayGroup.totals.scheduledHours || 0).toFixed(2));

                    if (scheduledHours <= 0 && worked <= 0) return;

                    const wage = getRateForDate({ dateStr: dateKey, history: historyRates, fallback: fallbackRate });

                    // Calculate regular and overtime hours
                    let regularHours = 0;
                    let overtimeHours = 0;
                    if (worked > 0) {
                        if (cumulativeWeekHours >= threshold) {
                            overtimeHours = worked;
                        } else if (cumulativeWeekHours + worked <= threshold) {
                            regularHours = worked;
                        } else {
                            regularHours = threshold - cumulativeWeekHours;
                            overtimeHours = worked - regularHours;
                        }
                        cumulativeWeekHours += worked;
                    }

                    const regularPay = regularHours * wage;
                    const overtimePay = overtimeHours * wage * overtimeMultiplier;
                    const dayEarnings = worked > 0 ? +(regularPay + overtimePay).toFixed(2) : 0;
                    const totalHours = +worked.toFixed(2);

                    // Check cache to avoid unnecessary writes
                    const cacheEntry = earningsCache[dateKey];
                    const signature = `${totalHours}|${dayEarnings}|${regularHours.toFixed(2)}|${overtimeHours.toFixed(2)}|${scheduledHours.toFixed(2)}|${wage}`;
                    if (cacheEntry === signature) {
                        return;
                    }

                    // Prepare write to RecordEarnings
                    const recRef = doc(dbFirestore, 'users', userId, 'RecordEarnings', dateKey);
                    writes.push(
                        setDoc(recRef, {
                            date: dateKey,
                            totalHours: totalHours,
                            scheduledHours: scheduledHours,
                            regularHours: +regularHours.toFixed(2),
                            overtimeHours: +overtimeHours.toFixed(2),
                            overtimeThreshold: threshold,
                            overtimePercent: overtimePercent,
                            dayEarnings: dayEarnings,
                            hourlyWageSnapshot: wage,
                            overtimeApplied: overtimeHours > 0,
                            noWorkRecorded: worked <= 0,
                            updatedAt: serverTimestamp()
                        }, { merge: true })
                    );
                    newCache[dateKey] = signature;
                });
            });

            // Execute all writes
            if (writes.length > 0) {
                Promise.all(writes)
                    .then(() => {
                        setEarningsCache(newCache);
                    })
                    .catch(err => {
                        console.error('Error updating RecordEarnings:', err);
                    });
            }
        })();
    }, [groupedSchedules, userId, userData, earningsCache, overtimeSettings]);

    return earningsCache;
}
