import { useEffect, useState } from 'react';
import { startOfWeek, endOfWeek } from 'date-fns';

/**
 * Custom hook to calculate weekly statistics from earnings records
 * @param {Array} recordEarnings - Array of daily earnings records
 * @param {Object} overtimeSettings - Overtime configuration (thresholdHours, overtimePercent)
 * @returns {Object} Weekly statistics including hours, earnings, and efficiency
 */
export function useWeeklyStats(recordEarnings, overtimeSettings) {
    const [weeklyStats, setWeeklyStats] = useState({
        scheduledHours: 0,
        workedHours: 0,
        efficiency: 0,
        weeklyEarnings: 0,
        regularHours: 0,
        overtimeHours: 0,
        regularEarnings: 0,
        overtimeEarnings: 0,
        thresholdCrossed: false
    });

    useEffect(() => {
        if (!recordEarnings || recordEarnings.length === 0) {
            setWeeklyStats({
                scheduledHours: 0,
                workedHours: 0,
                efficiency: 0,
                weeklyEarnings: 0,
                regularHours: 0,
                overtimeHours: 0,
                regularEarnings: 0,
                overtimeEarnings: 0,
                thresholdCrossed: false
            });
            return;
        }

        const today = new Date();
        const weekStart = startOfWeek(today, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

        let wScheduled = 0, wWorked = 0, wEarnings = 0;
        let wRegHours = 0, wOtHours = 0, wRegEarn = 0, wOtEarn = 0;

        recordEarnings.forEach(rec => {
            if (!rec?.date) return;
            const [y, m, d] = rec.date.split('-').map(Number);
            const recDate = new Date(y, m - 1, d);
            if (isNaN(recDate)) return;

            const worked = parseFloat(rec.totalHours) || 0;
            const scheduled = parseFloat(rec.scheduledHours) || 0;

            if (recDate >= weekStart && recDate <= weekEnd) {
                wWorked += worked;
                wScheduled += scheduled;
                const earn = parseFloat(rec.dayEarnings) || 0;
                wEarnings += earn;

                const regH = parseFloat(rec.regularHours);
                const otH = parseFloat(rec.overtimeHours);
                if (!isNaN(regH)) wRegHours += regH; else wRegHours += worked;
                if (!isNaN(otH)) wOtHours += otH;

                if (!isNaN(regH) && !isNaN(otH) && rec.hourlyWageSnapshot != null) {
                    const rate = parseFloat(rec.hourlyWageSnapshot) || 0;
                    const otPercent = parseFloat(rec.overtimePercent) || 0;
                    const otMultiplier = 1 + otPercent / 100;
                    const computedReg = (regH * rate);
                    const computedOt = (otH * rate * otMultiplier);
                    wRegEarn += +computedReg.toFixed(2);
                    wOtEarn += +computedOt.toFixed(2);
                }
            }
        });

        const efficiency = wScheduled > 0 ? ((wWorked / wScheduled) * 100).toFixed(1) : 0;

        if (wRegHours === 0 && wOtHours === 0 && wWorked > 0) {
            wRegHours = wWorked;
        }
        if ((wRegEarn + wOtEarn === 0) && wEarnings > 0) {
            wRegEarn = +wEarnings.toFixed(2);
        }

        const threshold = overtimeSettings.thresholdHours || 99999;
        const thresholdCrossed = wWorked > threshold;

        setWeeklyStats({
            scheduledHours: +wScheduled.toFixed(2),
            workedHours: +wWorked.toFixed(2),
            efficiency,
            weeklyEarnings: wEarnings.toFixed(2),
            regularHours: +wRegHours.toFixed(2),
            overtimeHours: +wOtHours.toFixed(2),
            regularEarnings: +wRegEarn.toFixed(2),
            overtimeEarnings: +wOtEarn.toFixed(2),
            thresholdCrossed
        });
    }, [recordEarnings, overtimeSettings]);

    return weeklyStats;
}
