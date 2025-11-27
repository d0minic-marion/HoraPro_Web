import { useState, useEffect } from 'react';
import { dbFirestore } from '../connections/ConnFirebaseServices';
import { collection, onSnapshot, query, orderBy, doc } from 'firebase/firestore';
import { 
    startOfWeek, 
    endOfWeek,
    differenceInMinutes
} from 'date-fns';
import { computeWorkedHoursForShift, deriveShiftStatus } from '../utils/timeHelpers';
import { syncWeeklyEarningsForUserWeek } from '../utils/earningsHelpers';
import { syncShiftDerivedFieldsIfNeeded } from '../utils/shiftSyncHelpers';
import { groupShiftsByDate, parseDateTime } from '../utils/scheduleUtils';
import { initializeScheduleNotificationMonitoring } from '../utils/scheduleNotificationHelpers';

/**
 * Custom hook to load all schedules for all users with real-time synchronization
 * Handles: calendar events, daily schedules grouping, weekly stats calculation, and earnings sync
 * @param {Array} users - Array of user objects
 * @returns {Object} - { calendarEvents, userDailySchedules, weeklyStats }
 */
function useAllSchedules(users) {
    const [calendarEvents, setCalendarEvents] = useState([]);
    const [userDailySchedules, setUserDailySchedules] = useState({});
    const [weeklyStats, setWeeklyStats] = useState({});

    useEffect(() => {
        if (!users || users.length === 0) return;

        const stats = {};
        let notificationCleanup = null;

        const loadAllSchedules = async () => {
            for (const user of users) {
                try {
                    const userScheduleRef = collection(dbFirestore, 'users', user.id, 'UserSchedule');
                    const scheduleQuery = query(userScheduleRef, orderBy('eventDate'));
                    
                    onSnapshot(scheduleQuery, async (snapshot) => {
                        // Build array of userEvents for calendar / table
                        const userEvents = await Promise.all(snapshot.docs.map(async (docSnap) => {
                            const data = docSnap.data();
                            const shiftRef = doc(dbFirestore, 'users', user.id, 'UserSchedule', docSnap.id);

                            // --- SYNC SHIFT FIELDS (totalHoursDay, status)
                            await syncShiftDerivedFieldsIfNeeded(shiftRef, data);

                            // Logging for debug / auditing
                            console.log('[SYNC CHECK]', {
                                userId: user.id,
                                shiftId: docSnap.id,
                                checkedInTime: data.checkedInTime,
                                checkedOutTime: data.checkedOutTime,
                                checkInTimestamp: data.checkInTimestamp,
                                checkOutTimestamp: data.checkOutTimestamp,
                                overnight: data.overnight,
                                computedHours: computeWorkedHoursForShift(data),
                                storedTotalHoursDay: data.totalHoursDay,
                                statusBefore: data.status,
                                derivedStatus: deriveShiftStatus(data)
                            });

                            // Build event object for calendar
                            const start = parseDateTime(data.eventDate, data.startHour);
                            let end;
                            if (data.endDate && data.endDate !== data.eventDate) {
                                end = parseDateTime(data.endDate, data.endHour);
                            } else {
                                end = parseDateTime(data.eventDate, data.endHour);
                                if (end <= start) {
                                    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
                                }
                            }

                            return {
                                id: docSnap.id,
                                userId: user.id,
                                title: `${user.firstName} ${user.lastName} - ${data.eventDescription}`,
                                start: start,
                                end: end,
                                resource: {
                                    ...data,
                                    userName: `${user.firstName} ${user.lastName}`,
                                    userHourlyWage: user.hourlyWage,
                                    shiftType: data.shiftType || 'regular'
                                }
                            };
                        }));

                        // --- SYNC WEEKLY EARNINGS ---
                        // Tomamos la SEMANA de HOY para ese usuario,
                        // porque este componente se usa como "motor en vivo".
                        // Usaremos el rango Monday->Sunday de la semana actual del sistema.
                        const now = new Date();
                        const weekStart = startOfWeek(now, { weekStartsOn: 1 });
                        const weekEnd   = endOfWeek(now, { weekStartsOn: 1 });

                        await syncWeeklyEarningsForUserWeek({
                            userId: user.id,
                            userHourlyWage: user.hourlyWage,
                            weekStartDate: weekStart,
                            weekEndDate: weekEnd
                        });

                        // Group schedules by user and date for validation UI
                        const userDailyGroup = groupShiftsByDate(
                            userEvents.map(event => ({
                                id: event.id,
                                eventDate: event.resource.eventDate,
                                startHour: event.resource.startHour,
                                endHour: event.resource.endHour,
                                eventDescription: event.resource.eventDescription,
                                checkedInTime: event.resource.checkedInTime,
                                checkedOutTime: event.resource.checkedOutTime,
                                totalHoursDay: event.resource.totalHoursDay
                            }))
                        );

                        // Update daily schedules state (used by validation)
                        setUserDailySchedules(prev => {
                            const updated = {
                                ...prev,
                                [user.id]: userDailyGroup
                            };
                            
                            // Reinitialize notification monitoring with updated schedules
                            if (notificationCleanup) {
                                notificationCleanup();
                            }
                            notificationCleanup = initializeScheduleNotificationMonitoring(users, updated);
                            
                            return updated;
                        });

                        // Calculate weekly stats (visual only, current week)
                        const nowForWeek = new Date();
                        const currentWeekStart = startOfWeek(nowForWeek, { weekStartsOn: 1 });
                        const currentWeekEnd = endOfWeek(nowForWeek, { weekStartsOn: 1 });

                        const weeklyEvents = userEvents.filter(event =>
                            event.start >= currentWeekStart &&
                            event.start <= currentWeekEnd
                        );

                        const weeklyHours = weeklyEvents
                            .reduce((total, event) => {
                                const minutes = differenceInMinutes(event.end, event.start);
                                return total + (minutes / 60);
                            }, 0);

                        stats[user.id] = {
                            weeklyHours,
                            totalShifts: weeklyEvents.length,
                            upcomingShifts: userEvents.filter(event => event.start > new Date()).length
                        };

                        // Update visible calendar state (no UI removal, just merge)
                        setCalendarEvents(prev => {
                            const filtered = prev.filter(event => event.userId !== user.id);
                            return [...filtered, ...userEvents];
                        });
                    });

                } catch (error) {
                    console.error(`Error loading schedule for user ${user.id}:`, error);
                }
            }
            
            setWeeklyStats(stats);
        };

        loadAllSchedules();

        // Return cleanup function
        return () => {
            if (notificationCleanup) {
                notificationCleanup();
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [users]);

    return { calendarEvents, userDailySchedules, weeklyStats };
}

export default useAllSchedules;
