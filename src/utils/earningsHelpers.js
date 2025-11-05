// Helpers for weekly overtime and earnings calculations
// Extracted from AddSchdule.js
import { format, addDays, isAfter, endOfWeek, startOfWeek } from 'date-fns';
import { collection, query, where, orderBy, getDocs, doc, setDoc, Timestamp } from 'firebase/firestore';
import { dbFirestore } from '../connections/ConnFirebaseServices';

/**
 * Sync weekly earnings for a user for a given week.
 * This function recalculates the entire week each time.
 */
export async function syncWeeklyEarningsForUserWeek({
    userId,
    userHourlyWage,
    weekStartDate, // Date obj (monday)
    weekEndDate,   // Date obj (sunday)
}) {
    const weekStartStr = format(weekStartDate, 'yyyy-MM-dd');
    const weekEndStr   = format(weekEndDate, 'yyyy-MM-dd');

    const userScheduleRef = collection(dbFirestore, 'users', userId, 'UserSchedule');
    const weekQuery = query(
        userScheduleRef,
        where('eventDate', '>=', weekStartStr),
        where('eventDate', '<=', weekEndStr),
        orderBy('eventDate')
    );
    const snapshot = await getDocs(weekQuery);

    const dayMap = {};
    let cursor = new Date(weekStartDate);
    while (!isAfter(cursor, weekEndDate)) {
        const dStr = format(cursor, 'yyyy-MM-dd');
        dayMap[dStr] = {
            scheduledHours: 0,
            totalHours: 0,
            shifts: []
        };
        cursor = addDays(cursor, 1);
    }

    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const dStr = data.eventDate;
        if (!dayMap[dStr]) {
            dayMap[dStr] = {
                scheduledHours: 0,
                totalHours: 0,
                shifts: []
            };
        }
        const planned = typeof data.duration === 'number' ? data.duration : 0;
        dayMap[dStr].scheduledHours += planned;
        const actual = typeof data.totalHoursDay === 'number' ? data.totalHoursDay : 0;
        dayMap[dStr].totalHours += actual;
        dayMap[dStr].shifts.push(data);
    });

    const OVERTIME_THRESHOLD_WEEK = 40;
    const OVERTIME_EXTRA_PERCENT  = 50;
    const OVERTIME_MULTIPLIER     = 1.5;
    let runningTotalRegularEligible = 0;

    cursor = new Date(weekStartDate);
    while (!isAfter(cursor, weekEndDate)) {
        const dStr = format(cursor, 'yyyy-MM-dd');
        const dayInfo = dayMap[dStr];
        const dayHours = dayInfo.totalHours;
        let regularHoursForDay = 0;
        let overtimeHoursForDay = 0;
        if (dayHours > 0) {
            const remainingRegularCapacity = Math.max(OVERTIME_THRESHOLD_WEEK - runningTotalRegularEligible, 0);
            if (dayHours <= remainingRegularCapacity) {
                regularHoursForDay = dayHours;
                overtimeHoursForDay = 0;
            } else {
                regularHoursForDay = remainingRegularCapacity;
                overtimeHoursForDay = dayHours - remainingRegularCapacity;
            }
            runningTotalRegularEligible += regularHoursForDay;
        }
        const wage = typeof userHourlyWage === 'number' ? userHourlyWage : 0;
        const regularPay  = regularHoursForDay * wage;
        const overtimePay = overtimeHoursForDay * wage * OVERTIME_MULTIPLIER;
        const dayEarnings = Number((regularPay + overtimePay).toFixed(2));
        const recordData = {
            date: dStr,
            scheduledHours: Number(dayInfo.scheduledHours.toFixed(2)),
            totalHours: Number(dayInfo.totalHours.toFixed(2)),
            regularHours: Number(regularHoursForDay.toFixed(2)),
            overtimeHours: Number(overtimeHoursForDay.toFixed(2)),
            overtimeApplied: overtimeHoursForDay > 0,
            hourlyWageSnapshot: wage,
            overtimePercent: OVERTIME_EXTRA_PERCENT,
            overtimeThreshold: OVERTIME_THRESHOLD_WEEK,
            dayEarnings,
            noWorkRecorded: dayInfo.totalHours === 0,
            updatedAt: Timestamp.now()
        };
        const earningsDocRef = doc(
            dbFirestore,
            'users',
            userId,
            'RecordEarnings',
            dStr
        );
        await setDoc(earningsDocRef, recordData, { merge: true });
        cursor = addDays(cursor, 1);
    }
}
