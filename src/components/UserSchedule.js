

import { useEffect, useState, useMemo } from 'react';
import { dbFirestore } from '../connections/ConnFirebaseServices'
import { collection, onSnapshot, query, orderBy, doc, updateDoc, getDoc, addDoc, deleteDoc, setDoc, serverTimestamp, deleteField, Timestamp } from 'firebase/firestore';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';

import { syncShiftDerivedFieldsIfNeeded } from '../utils/shiftSyncHelpers';

import {
    format,
    differenceInMinutes,
    startOfWeek,
    endOfWeek,
    addMinutes,
    isPast,
    addDays,
    startOfDay,
    endOfDay,
    isSameDay
} from 'date-fns';
import UserScheduleHeader from './userSchedule/UserScheduleHeader';
import WeeklyStatsCard from './userSchedule/WeeklyStatsCard';
import ScheduleList from './userSchedule/ScheduleList';
import CalendarPanel from './userSchedule/CalendarPanel';
import { syncWeeklyEarningsForUserWeek, loadWageHistory, getRateForDate } from '../utils/earningsHelpers';
import {
    groupShiftsByDate,
    parseDate,
    parseDateTime
} from '../utils/scheduleUtils';



function UserSchedule() {
    const navigate = useNavigate()
    const location = useLocation()
    const userId = location.state?.userId || ''
    const [currentUserName, setCurrentUserName] = useState(location.state?.userName || 'Employee')
    const [currentUserCategory, setCurrentUserCategory] = useState(location.state?.userCategory || '')

    const [scheduleData, setScheduleData] = useState([])
    const [groupedSchedules, setGroupedSchedules] = useState({})
    const [earningsCache, setEarningsCache] = useState({})
    const [userData, setUserData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [currentView, setCurrentView] = useState('table')

    // Time tracking states
    const [currentTime, setCurrentTime] = useState(new Date())
    const [timeCheckIn, setTimeCheckIn] = useState('')
    const [timeCheckOut, setTimeCheckOut] = useState('')
    const [startHour, setStartHour] = useState('')
    const [endHour, setEndHour] = useState('')
    const [eventToEdit, setEventToEdit] = useState(null)
    const [editMenuVisibility, setEditMenuVisibility] = useState(false)
    const [shiftOptionsVisible, setShiftOptionsVisible] = useState(false)
    const [selectedShift, setSelectedShift] = useState(null)
    const [overnightEdit, setOvernightEdit] = useState(false)
    const [checkOutOvernightEdit, setCheckOutOvernightEdit] = useState(false)
    const [isUpdating, setIsUpdating] = useState(false)
    const [createShiftVisible, setCreateShiftVisible] = useState(false)
    const [newShiftData, setNewShiftData] = useState(null)
    const [shiftDescription, setShiftDescription] = useState('')

    // Weekly stats
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
    })
    const [recordEarnings, setRecordEarnings] = useState([])
    const [overtimeSettings, setOvertimeSettings] = useState({ thresholdHours: 40, overtimePercent: 50 })

    // Listener for RecordEarnings
    useEffect(() => {
        if (!userId) return;
        const recCol = collection(dbFirestore, 'users', userId, 'RecordEarnings');
        const qRec = query(recCol, orderBy('date', 'asc'));
        const unsub = onSnapshot(qRec, (snap) => {
            const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setRecordEarnings(docs);
        });
        return () => unsub();
    }, [userId]);

    // Load global overtime settings
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const ref = doc(dbFirestore, 'SystemSettings', 'OvertimeRules');
                const snap = await getDoc(ref);
                if (snap.exists()) {
                    const data = snap.data();
                    const thresholdHours = parseFloat(data.thresholdHours) || 40;
                    const overtimePercent = parseFloat(data.overtimePercent) || 50;
                    setOvertimeSettings({ thresholdHours, overtimePercent });
                } else {
                    await setDoc(ref, {
                        thresholdHours: 40,
                        overtimePercent: 50,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    }, { merge: true });
                }
            } catch (e) {
                console.error('Error loading overtime settings', e);
            }
        };
        loadSettings();
    }, []);

    // Recompute weekly stats
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

    // live clock
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Load user data and schedule
    useEffect(() => {
        if (!userId) {
            toast.error('No user ID provided', { position: 'top-right' });
            navigate('/schedulizer');
            return;
        }

        const loadUserInfo = async () => {
            try {
                const userDocRef = doc(dbFirestore, 'users', userId);
                const userDoc = await getDoc(userDocRef);
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    setUserData(data);
                    if (currentUserName === 'Employee') {
                        setCurrentUserName(`${data.firstName} ${data.lastName}`);
                    }
                    if (!currentUserCategory) {
                        setCurrentUserCategory(data.category || '');
                    }
                }
            } catch (error) {
                console.error('Error loading user info:', error);
            }
        };
        loadUserInfo();

        const refColUsers = collection(dbFirestore, 'users', userId, "UserSchedule")
        const querySchedule = query(refColUsers, orderBy('eventDate', 'desc'))
        const unsubscribe = onSnapshot(querySchedule, (snapshot) => {
            const scheduleRegisters = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            }))
            setScheduleData(scheduleRegisters)
            const grouped = groupShiftsByDate(scheduleRegisters);
            setGroupedSchedules(grouped);
            
            // --- Silent reactive sync for external changes (no UI impact)
            // Ensures totalHoursDay and status stay correct if external apps modify check-in/out fields.
            try {
                snapshot.docs.forEach((docSnap) => {
                    const shiftRef = doc(dbFirestore, 'users', userId, 'UserSchedule', docSnap.id);
                    const data = docSnap.data();
                    // Fire-and-forget; avoids blocking UI. Helper only writes when values differ.
                    syncShiftDerivedFieldsIfNeeded(shiftRef, data).catch((err) => {
                        console.error('[AutoSync] Failed to sync derived fields', { id: docSnap.id, err });
                    });
                });
            } catch (err) {
                console.error('[AutoSync] Error preparing sync', err);
            }
            setLoading(false)
        }, (error) => {
            console.log('Error fetching schedule', error)
            toast.error('Error loading schedule data', { position: 'top-right' });
setLoading(false)
        })
        return () => unsubscribe()
    }, [userId, navigate, currentUserName, currentUserCategory, userData])

    // Consolidate daily total hours & earnings into RecordEarnings
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

            Object.keys(weekMap).forEach(weekKey => {
                let cumulativeWeekHours = 0;
                weekMap[weekKey].forEach(dateKey => {
                    const dayGroup = groupedSchedules[dateKey];
                    if (!dayGroup?.totals) return;
                    const worked = parseFloat(dayGroup.totals.workedHours || 0);
                    const scheduledHours = +(parseFloat(dayGroup.totals.scheduledHours || 0).toFixed(2));

                    if (scheduledHours <= 0 && worked <= 0) return;

                    const wage = getRateForDate({ dateStr: dateKey, history: historyRates, fallback: fallbackRate });

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

                    const cacheEntry = earningsCache[dateKey];
                    const signature = `${totalHours}|${dayEarnings}|${regularHours.toFixed(2)}|${overtimeHours.toFixed(2)}|${scheduledHours.toFixed(2)}|${wage}`;
                    if (cacheEntry === signature) {
                        return;
                    }

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
    }, [groupedSchedules, userId, userData, earningsCache, overtimeSettings])

    //
    // Calendar events for react-big-calendar
    // MODIFICADO: ahora partimos los turnos overnight en dos eventos visuales,
    // manteniendo el mismo .id para no romper onSelectEvent ni handleEventClick.
    //
    const calendarEvents = useMemo(() => {
        return scheduleData.flatMap(schedule => {
            // start real
            const start = parseDateTime(schedule.eventDate, schedule.startHour);

            // end real (incluyendo overnight verdadero)
            let finalEnd;
            if (schedule.endDate && schedule.endDate !== schedule.eventDate) {
                finalEnd = parseDateTime(schedule.endDate, schedule.endHour);
            } else {
                finalEnd = parseDateTime(schedule.eventDate, schedule.endHour);
                if (finalEnd <= start) {
                    finalEnd = new Date(finalEnd.getTime() + 24 * 60 * 60 * 1000);
                }
            }

            // status / color (copia exacta de tu lgica original)
            let status = 'scheduled';
            let color = '#2563eb';
            if (schedule.checkedInTime && schedule.checkedOutTime) {
                status = 'completed';
                color = '#10b981';
            } else if (schedule.checkedInTime && !schedule.checkedOutTime) {
                status = 'in-progress';
                color = '#f59e0b';
            } else if (isPast(finalEnd)) {
                status = 'missed';
                color = '#ef4444';
            }
            if (schedule.overnight) {
                color = '#6366f1';
            }

            const baseTitle = schedule.eventDescription + (schedule.overnight ? ' (overnight)' : '');

            // caso simple: no cruza de da
            if (isSameDay(start, finalEnd)) {
                return [{
                    id: schedule.id,
                    title: baseTitle,
                    start,
                    end: finalEnd,
                    resource: { ...schedule, status, color }
                }];
            }

            // caso overnight: dividir en 2 segmentos
            const firstPartStart = start;
            const firstPartEnd = endOfDay(start);

            const secondPartStart = startOfDay(finalEnd);
            const secondPartEnd = finalEnd;

            return [
                {
                    id: schedule.id,
                    title: baseTitle,
                    start: firstPartStart,
                    end: firstPartEnd,
                    resource: { ...schedule, status, color, isContinuation: false }
                },
                {
                    id: schedule.id,
                    title: baseTitle,
                    start: secondPartStart,
                    end: secondPartEnd,
                    resource: { ...schedule, status, color, isContinuation: true }
                }
            ];
        });
    }, [scheduleData]);

    function editInOutTime(reg) {
        if (reg.isContinuation) {
            toast.info('This is an automatic continuation of an overnight shift. Please edit the original shift.');
            return;
        }
        setEventToEdit(reg)
        setTimeCheckIn(reg.checkedInTime || '')
        setTimeCheckOut(reg.checkedOutTime || '')
        setStartHour(reg.startHour || '')
        setEndHour(reg.endHour || '')
        setShiftDescription(reg.eventDescription || '')
        setOvernightEdit(Boolean(reg.overnight || (reg.endDate && reg.endDate !== reg.eventDate) || (reg.endHour <= reg.startHour)))

        if (reg.checkedInTime && reg.checkedOutTime) {
            const checkIn = new Date(`${reg.eventDate}T${reg.checkedInTime}`);
            const checkOut = new Date(`${reg.eventDate}T${reg.checkedOutTime}`);
            setCheckOutOvernightEdit(checkOut <= checkIn);
        } else {
            setCheckOutOvernightEdit(false);
        }
        setEditMenuVisibility(true)
    }

    async function checkInTime(reg) {
        if (userData && userData.isActive === false) {
            toast.error('This user is inactive. Check-in is disabled.');
            return;
        }
        if (!reg || !reg.id || !timeCheckIn) {
            toast.error("Please select a valid time for check-in");
            return;
        }

        setIsUpdating(true);
        try {
            const shiftRef = doc(dbFirestore, 'users', userId, "UserSchedule", reg.id);

            await updateDoc(shiftRef, {
                checkedInTime: timeCheckIn,
                checkInTimestamp: deleteField(),
                eventDescription: shiftDescription || reg.eventDescription
            });
            setEventToEdit(prev => prev && prev.id === reg.id ? {
                ...prev,
                checkedInTime: timeCheckIn,
                checkInTimestamp: null
            } : prev);

            try {
                await syncShiftDerivedFieldsIfNeeded(shiftRef, {
                    ...reg,
                    checkedInTime: timeCheckIn,
                    checkInTimestamp: null
                });
            } catch (deriveErr) {
                console.error('Failed to sync derived fields after check-in:', deriveErr);
            }

            toast.success(" Checked in successfully!");
            // Re-sync weekly earnings for the affected week (non-blocking)
            try {
                if (userData && userData.hourlyWage) {
                    const eventDateObj = parseDate(reg.eventDate);
                    const weekStart = startOfWeek(eventDateObj, { weekStartsOn: 1 });
                    const weekEnd = endOfWeek(eventDateObj, { weekStartsOn: 1 });
                    await syncWeeklyEarningsForUserWeek({
                        userId,
                        userHourlyWage: parseFloat(userData.hourlyWage) || 0,
                        weekStartDate: weekStart,
                        weekEndDate: weekEnd,
                    });
                }
            } catch (e) {
                console.error('Weekly earnings sync failed (non-blocking):', e);
            }
        } catch (error) {
            toast.error(" Failed to check in!");
        } finally {
            setIsUpdating(false);
        }
    }

    async function checkOutTime(reg) {
        if (userData && userData.isActive === false) {
            toast.error('This user is inactive. Check-out is disabled.');
            return;
        }
        if (!reg || !reg.id || !timeCheckOut) {
            toast.error("Please select a valid time for check-out");
            return;
        }

        const checkInHour = timeCheckIn || reg.checkedInTime;
        if (!checkInHour) {
            toast.error("Check-in time is required before check-out");
            return;
        }

        const baseEndDateStr = (reg.endDate && reg.endDate !== reg.eventDate) ? reg.endDate : reg.eventDate;
        let checkInDate = parseDateTime(reg.eventDate, checkInHour);
        let checkOutDate = parseDateTime(baseEndDateStr, timeCheckOut);
        let isOvernight = checkOutOvernightEdit;
        let effectiveEndDateStr = baseEndDateStr;

        if (!isOvernight && checkOutDate <= checkInDate) {
            isOvernight = true;
        }
        if (isOvernight) {
            effectiveEndDateStr = format(addDays(parseDate(reg.eventDate), 1), 'yyyy-MM-dd');
            checkOutDate = parseDateTime(effectiveEndDateStr, timeCheckOut);
        }

        const totalMinutes = differenceInMinutes(checkOutDate, checkInDate);
        if (totalMinutes <= 0) {
            toast.error("Check-out time must be after check-in time");
            return;
        }
        setIsUpdating(true);
        try {
            const shiftRef = doc(dbFirestore, 'users', userId, "UserSchedule", reg.id);

            const updatePayload = {
                checkedOutTime: timeCheckOut,
                checkOutTimestamp: deleteField(),
                eventDescription: shiftDescription || reg.eventDescription,
                overnight: isOvernight
            };

            if (isOvernight) {
                updatePayload.endDate = effectiveEndDateStr;
            } else {
                updatePayload.endDate = deleteField();
            }

            await updateDoc(shiftRef, updatePayload);

            setEventToEdit(prev => {
                if (!prev || prev.id !== reg.id) return prev;
                const updated = {
                    ...prev,
                    checkedOutTime: timeCheckOut,
                    checkOutTimestamp: null,
                    overnight: isOvernight
                };
                if (isOvernight) {
                    updated.endDate = effectiveEndDateStr;
                } else {
                    delete updated.endDate;
                }
                return updated;
            });

            const updatedShift = {
                ...reg,
                checkedInTime: checkInHour,
                checkedOutTime: timeCheckOut,
                checkOutTimestamp: null,
                overnight: isOvernight
            };
            if (isOvernight) {
                updatedShift.endDate = effectiveEndDateStr;
            } else if (updatedShift.endDate) {
                delete updatedShift.endDate;
            }

            try {
                await syncShiftDerivedFieldsIfNeeded(shiftRef, updatedShift);
            } catch (deriveErr) {
                console.error('Failed to sync derived fields after check-out:', deriveErr);
            }

            toast.success(" Checked out successfully!");
            setEditMenuVisibility(false);

            // Weekly sync to capture worked hours
            try {
                if (userData && userData.hourlyWage) {
                    const eventDateObj = parseDate(reg.eventDate);
                    const weekStart = startOfWeek(eventDateObj, { weekStartsOn: 1 });
                    const weekEnd = endOfWeek(eventDateObj, { weekStartsOn: 1 });
                    await syncWeeklyEarningsForUserWeek({
                        userId,
                        userHourlyWage: parseFloat(userData.hourlyWage) || 0,
                        weekStartDate: weekStart,
                        weekEndDate: weekEnd,
                    });
                }
            } catch (e) {
                console.error('Weekly earnings sync failed (non-blocking):', e);
            }
        } catch (error) {
            toast.error(" Failed to check out!");
        } finally {
            setIsUpdating(false);
        }
    }

    async function checkInTimestampOnly(reg) {
        if (userData && userData.isActive === false) {
            toast.error('This user is inactive. Check-in is disabled.');
            return;
        }
        if (!reg || !reg.id) {
            toast.error("Please select a valid shift");
            return;
        }

        const timestamp = Timestamp.now();

        setIsUpdating(true);
        try {
            const shiftRef = doc(dbFirestore, 'users', userId, "UserSchedule", reg.id);

            await updateDoc(shiftRef, {
                checkInTimestamp: timestamp,
                checkedInTime: deleteField(),
                eventDescription: shiftDescription || reg.eventDescription
            });
            setEventToEdit(prev => prev && prev.id === reg.id ? {
                ...prev,
                checkInTimestamp: timestamp,
                checkedInTime: null
            } : prev);

            try {
                await syncShiftDerivedFieldsIfNeeded(shiftRef, {
                    ...reg,
                    checkInTimestamp: timestamp,
                    checkedInTime: null
                });
            } catch (deriveErr) {
                console.error('Failed to sync derived fields after timestamp check-in:', deriveErr);
            }

            toast.success(" Check-in timestamp updated successfully!");

            try {
                if (userData && userData.hourlyWage) {
                    const eventDateObj = parseDate(reg.eventDate);
                    const weekStart = startOfWeek(eventDateObj, { weekStartsOn: 1 });
                    const weekEnd = endOfWeek(eventDateObj, { weekStartsOn: 1 });
                    await syncWeeklyEarningsForUserWeek({
                        userId,
                        userHourlyWage: parseFloat(userData.hourlyWage) || 0,
                        weekStartDate: weekStart,
                        weekEndDate: weekEnd,
                    });
                }
            } catch (e) {
                console.error('Weekly earnings sync failed (non-blocking):', e);
            }
        } catch (error) {
            toast.error(" Failed to update check-in timestamp!");
        } finally {
            setIsUpdating(false);
        }
    }

    async function checkOutTimestampOnly(reg) {
        if (userData && userData.isActive === false) {
            toast.error('This user is inactive. Check-out is disabled.');
            return;
        }
        if (!reg || !reg.id) {
            toast.error("Please select a valid shift");
            return;
        }

        const hasCheckInReference = reg.checkInTimestamp;
        if (!hasCheckInReference) {
            toast.error("A check-in timestamp is required before recording a check-out timestamp");
            return;
        }

        const timestamp = Timestamp.now();
        const checkInTimestamp = reg.checkInTimestamp;
        const checkInDate = checkInTimestamp
            ? (typeof checkInTimestamp.toDate === 'function'
                ? checkInTimestamp.toDate()
                : (checkInTimestamp instanceof Date ? checkInTimestamp : null))
            : null;
        const checkOutDateObj = timestamp.toDate();

        if (checkInDate && checkOutDateObj <= checkInDate) {
            toast.error("Check-out timestamp must be after the check-in timestamp");
            return;
        }

        const isOvernight = checkInDate ? checkOutDateObj.getDate() !== checkInDate.getDate() : false;
        const effectiveEndDateStr = format(checkOutDateObj, 'yyyy-MM-dd');

        setIsUpdating(true);
        try {
            const shiftRef = doc(dbFirestore, 'users', userId, "UserSchedule", reg.id);

            const updatePayload = {
                checkOutTimestamp: timestamp,
                checkedOutTime: deleteField(),
                eventDescription: shiftDescription || reg.eventDescription,
                overnight: isOvernight
            };
            if (isOvernight) {
                updatePayload.endDate = effectiveEndDateStr;
            } else {
                updatePayload.endDate = deleteField();
            }

            await updateDoc(shiftRef, updatePayload);
            setEventToEdit(prev => {
                if (!prev || prev.id !== reg.id) return prev;
                const updated = {
                    ...prev,
                    checkOutTimestamp: timestamp,
                    checkedOutTime: null,
                    overnight: isOvernight
                };
                if (isOvernight) {
                    updated.endDate = effectiveEndDateStr;
                } else {
                    delete updated.endDate;
                }
                return updated;
            });

            const updatedShift = {
                ...reg,
                checkOutTimestamp: timestamp,
                checkedOutTime: null,
                checkInTimestamp: reg.checkInTimestamp,
                overnight: isOvernight
            };
            if (isOvernight) {
                updatedShift.endDate = effectiveEndDateStr;
            } else if (updatedShift.endDate) {
                delete updatedShift.endDate;
            }

            try {
                await syncShiftDerivedFieldsIfNeeded(shiftRef, updatedShift);
            } catch (deriveErr) {
                console.error('Failed to sync derived fields after timestamp check-out:', deriveErr);
            }

            toast.success(" Check-out timestamp updated successfully!");
            setEditMenuVisibility(false);

            try {
                if (userData && userData.hourlyWage) {
                    const eventDateObj = parseDate(reg.eventDate);
                    const weekStart = startOfWeek(eventDateObj, { weekStartsOn: 1 });
                    const weekEnd = endOfWeek(eventDateObj, { weekStartsOn: 1 });
                    await syncWeeklyEarningsForUserWeek({
                        userId,
                        userHourlyWage: parseFloat(userData.hourlyWage) || 0,
                        weekStartDate: weekStart,
                        weekEndDate: weekEnd,
                    });
                }
            } catch (e) {
                console.error('Weekly earnings sync failed (non-blocking):', e);
            }
        } catch (error) {
            toast.error(" Failed to update check-out timestamp!");
        } finally {
            setIsUpdating(false);
        }
    }

    function closeMenuVisibility(e) {
        e?.preventDefault()
        setEditMenuVisibility(false)
        setEventToEdit(null)
        setTimeCheckIn('')
        setTimeCheckOut('')
        setStartHour('')
        setEndHour('')
        setShiftDescription('')
        setCheckOutOvernightEdit(false)
    }

    async function updateDescription(reg) {
        if (!reg || !reg.id) {
            toast.error("Please select a valid shift");
            return;
        }

        setIsUpdating(true);
        try {
            await updateDoc(doc(dbFirestore, 'users', userId, "UserSchedule", reg.id), {
                eventDescription: shiftDescription || 'No description'
            });
            toast.success(" Description updated successfully!");
        } catch (error) {
            toast.error(" Error updating description!");
        } finally {
            setIsUpdating(false);
        }
    }

    async function updateScheduleTimes(reg) {
        if (!reg || !reg.id || !startHour || !endHour) {
            toast.error("Please select valid times");
            return;
        }
        const startDate = parseDateTime(reg.eventDate, startHour);
        let endDateStr = (reg.endDate && reg.endDate !== reg.eventDate) ? reg.endDate : reg.eventDate;
        let endDate = parseDateTime(endDateStr, endHour);
        let crosses = false;
        if (overnightEdit) {
            if (endDate <= startDate) {
                endDate = parseDateTime(format(addDays(parseDate(reg.eventDate), 1), 'yyyy-MM-dd'), endHour);
            }
            crosses = endDate.getDate() !== startDate.getDate();
        } else {
            if (endDate <= startDate) {
                toast.error('End time must be after start time (or mark Overnight)');
                return;
            }
        }

        const durationMinutes = differenceInMinutes(endDate, startDate);
        if (durationMinutes < 15) {
            toast.error('The shift must last at least 15 minutes');
            return;
        }

        const overlappingShifts = scheduleData.filter(shift => {
            if (shift.id === reg.id) return false;
            const exStart = parseDateTime(shift.eventDate, shift.startHour || '00:00');
            const endBaseDate = (shift.endDate && shift.endDate !== shift.eventDate) ? shift.endDate : shift.eventDate;
            let exEnd = parseDateTime(endBaseDate, shift.endHour || shift.startHour || '00:00');
            if (exEnd <= exStart) {
                exEnd = new Date(exEnd.getTime() + 24 * 60 * 60 * 1000);
            }
            return (startDate < exEnd && endDate > exStart);
        });

        if (overlappingShifts.length > 0) {
            const overlappingShift = overlappingShifts[0];
            toast.error(` Schedule conflict: The new schedule would overlap with the shift from ${overlappingShift.startHour} to ${overlappingShift.endHour} - "${overlappingShift.eventDescription}"`, {
                position: 'top-right',
                autoClose: 6000
            });
            return;
        }

        setIsUpdating(true);
        try {
            const shiftRef = doc(dbFirestore, 'users', userId, "UserSchedule", reg.id);
            const durationHours = Number((durationMinutes / 60).toFixed(2));
            const payload = {
                startHour,
                endHour,
                overnight: crosses,
                eventDescription: shiftDescription || reg.eventDescription,
                duration: durationHours
            };
            if (crosses) {
                payload.endDate = format(addDays(parseDate(reg.eventDate), 1), 'yyyy-MM-dd');
            } else {
                payload.endDate = deleteField();
            }
            await updateDoc(shiftRef, payload);

            // Recompute derived fields (status, totalHoursDay) if check-in/out exists
            try {
                await syncShiftDerivedFieldsIfNeeded(shiftRef, {
                    ...reg,
                    startHour,
                    endHour,
                    endDate: crosses ? format(addDays(parseDate(reg.eventDate), 1), 'yyyy-MM-dd') : reg.eventDate,
                    overnight: crosses,
                    duration: durationHours
                });
            } catch (deriveErr) {
                console.error('Failed to sync derived fields after updating shift times:', deriveErr);
            }

            // Re-sync derived weekly aggregates so scheduled totals reflect the new span
            try {
                const eventDateObj = parseDate(reg.eventDate);
                const weekStart = startOfWeek(eventDateObj, { weekStartsOn: 1 });
                const weekEnd = endOfWeek(eventDateObj, { weekStartsOn: 1 });
                const hourlyWage = Number(userData?.hourlyWage) || 0;
                await syncWeeklyEarningsForUserWeek({
                    userId,
                    userHourlyWage: hourlyWage,
                    weekStartDate: weekStart,
                    weekEndDate: weekEnd
                });
            } catch (syncErr) {
                console.error('Weekly earnings sync failed after updating shift times:', syncErr);
            }
            toast.success(" Shift times updated successfully!");
        } catch (error) {
            toast.error(" Error updating shift times!");
            console.error('Error updating schedule times:', error);
        } finally {
            setIsUpdating(false);
        }
    }

    const quickCheckIn = (schedule) => {
        const now = new Date();
        const currentTimeStr = format(now, 'HH:mm');
        setTimeCheckIn(currentTimeStr);
        checkInTime({ ...schedule, checkedInTime: currentTimeStr });
    };

    const quickCheckOut = (schedule) => {
        const now = new Date();
        const currentTimeStr = format(now, 'HH:mm');
        setTimeCheckOut(currentTimeStr);
        checkOutTime({ ...schedule, checkedOutTime: currentTimeStr });
    };

    const handleEventClick = (schedule) => {
        setSelectedShift(schedule);
        setShiftOptionsVisible(true);
    };

    const deleteShift = async (schedule) => {
        try {
            const scheduleRef = doc(dbFirestore, 'users', userId, 'UserSchedule', schedule.id);
            await deleteDoc(scheduleRef);

            toast.success('Shift deleted successfully', {
                position: 'top-right',
                autoClose: 3000
            });

            setShiftOptionsVisible(false);
            setSelectedShift(null);

        } catch (error) {
            console.error('Error deleting shift:', error);
            toast.error('Error deleting shift', {
                position: 'top-right',
                autoClose: 5000
            });
        }
    };

    const editShiftFromCalendar = (schedule) => {
        setShiftOptionsVisible(false);
        setSelectedShift(null);
        editInOutTime(schedule);
    };

    // Handle creating new shift by dragging on calendar
    const handleSelectSlot = ({ start, end }) => {
        let slotStart = start;
        let slotEnd = end;
        let durationMinutes = differenceInMinutes(slotEnd, slotStart);
        const isAllDaySelection = durationMinutes >= 24 * 60 || durationMinutes === 0;

        if (isAllDaySelection) {
            const defaultStart = new Date(
                slotStart.getFullYear(),
                slotStart.getMonth(),
                slotStart.getDate(),
                8,
                0,
                0,
                0
            );
            const defaultEnd = new Date(defaultStart.getTime() + 8 * 60 * 60 * 1000);
            slotStart = defaultStart;
            slotEnd = defaultEnd;
            durationMinutes = differenceInMinutes(slotEnd, slotStart);
        }

        // Validate minimum duration (15 minutes)
        if (durationMinutes < 15) {
            toast.error('The shift must last at least 15 minutes', { position: 'top-right' });
            return;
        }

        // Format dates for the new shift
        const eventDate = format(slotStart, 'yyyy-MM-dd');
        const startHour = format(slotStart, 'HH:mm');
        const endHour = format(slotEnd, 'HH:mm');

        // Quick check for overlapping shifts before opening modal
        const overlappingShifts = scheduleData.filter(shift => {
            if (shift.eventDate !== eventDate) return false;

            const existingStartTime = parseDateTime(shift.eventDate, shift.startHour);
            const endBaseDate = (shift.endDate && shift.endDate !== shift.eventDate) ? shift.endDate : shift.eventDate;
            let existingEndTime = parseDateTime(endBaseDate, shift.endHour);
            if (existingEndTime <= existingStartTime) {
                existingEndTime = new Date(existingEndTime.getTime() + 24 * 60 * 60 * 1000);
            }

            // Check if there's any overlap
            return (slotStart < existingEndTime && slotEnd > existingStartTime);
        });

        if (overlappingShifts.length > 0) {
            const overlappingShift = overlappingShifts[0];
            toast.error(` Cannot create shift: It would overlap with the existing shift from ${overlappingShift.startHour} to ${overlappingShift.endHour} - "${overlappingShift.eventDescription}"`, {
                position: 'top-right',
                autoClose: 6000
            });
            return;
        }

        const crossesMidnight = format(slotStart, 'yyyy-MM-dd') !== format(slotEnd, 'yyyy-MM-dd');
        const derivedEndDate = crossesMidnight
            ? format(addDays(parseDate(eventDate), 1), 'yyyy-MM-dd')
            : eventDate;

        // Set up data for the modal
        const shiftDraft = {
            eventDate,
            startHour,
            endHour,
            start: slotStart,
            end: slotEnd,
            overnight: crossesMidnight
        };
        if (crossesMidnight) {
            shiftDraft.endDate = derivedEndDate;
        }
        setNewShiftData(shiftDraft);

        setShiftDescription('');
        setCreateShiftVisible(true);
    };


    const createShiftWithDescription = async () => {
        if (!newShiftData) return;

        try {
            setIsUpdating(true);

            // Check for overlapping shifts
            const newStartTime = parseDateTime(newShiftData.eventDate, newShiftData.startHour);
            const newEndBaseDate = newShiftData.endDate && newShiftData.endDate !== newShiftData.eventDate
                ? newShiftData.endDate
                : newShiftData.eventDate;
            const newEndTime = parseDateTime(newEndBaseDate, newShiftData.endHour);

            // Find overlapping shifts on the same date
            const overlappingShifts = scheduleData.filter(shift => {
                if (shift.eventDate !== newShiftData.eventDate) return false;

                const existingStartTime = parseDateTime(shift.eventDate, shift.startHour);
                const existingEndBase = (shift.endDate && shift.endDate !== shift.eventDate) ? shift.endDate : shift.eventDate;
                let existingEndTime = parseDateTime(existingEndBase, shift.endHour);
                if (existingEndTime <= existingStartTime) {
                    existingEndTime = new Date(existingEndTime.getTime() + 24 * 60 * 60 * 1000);
                }

                // Check if there's any overlap
                return (newStartTime < existingEndTime && newEndTime > existingStartTime);
            });

            if (overlappingShifts.length > 0) {
                const overlappingShift = overlappingShifts[0];
                toast.error(` Schedule conflict: There is already a shift from ${overlappingShift.startHour} to ${overlappingShift.endHour} - "${overlappingShift.eventDescription}"`, {
                    position: 'top-right',
                    autoClose: 6000
                });
                return;
            }

            let plannedEnd = parseDateTime(newEndBaseDate, newShiftData.endHour);
            if (plannedEnd <= newStartTime || newShiftData.overnight) {
                const nextDayStr = format(addDays(parseDate(newShiftData.eventDate), 1), 'yyyy-MM-dd');
                plannedEnd = parseDateTime(nextDayStr, newShiftData.endHour);
            }
            const plannedMinutes = differenceInMinutes(plannedEnd, newStartTime);
            const plannedHours = Number((plannedMinutes / 60).toFixed(2));

            // Create new shift object
            const newShift = {
                eventDate: newShiftData.eventDate,
                startHour: newShiftData.startHour,
                endHour: newShiftData.endHour,
                eventDescription: shiftDescription || 'New shift',
                checkedInTime: '',
                checkedOutTime: '',
                totalHoursDay: null,
                duration: plannedHours,
                overnight: newShiftData.overnight || false,
                status: 'scheduled',
                shiftType: 'regular',
                createdAt: serverTimestamp()
            };
            if (newShift.overnight) {
                newShift.endDate = format(addDays(parseDate(newShiftData.eventDate), 1), 'yyyy-MM-dd');
            }

            // Add to Firebase
            const scheduleCollection = collection(dbFirestore, 'users', userId, 'UserSchedule');
            await addDoc(scheduleCollection, newShift);

            // Re-sync weekly stats so scheduled totals include the new shift
            try {
                const eventDateObj = newShiftData.start;
                const weekStart = startOfWeek(eventDateObj, { weekStartsOn: 1 });
                const weekEnd = endOfWeek(eventDateObj, { weekStartsOn: 1 });
                const hourlyWage = Number(userData?.hourlyWage) || 0;
                await syncWeeklyEarningsForUserWeek({
                    userId,
                    userHourlyWage: hourlyWage,
                    weekStartDate: weekStart,
                    weekEndDate: weekEnd
                });
            } catch (syncErr) {
                console.error('Weekly earnings sync failed after creating shift:', syncErr);
            }

            toast.success(`Shift created: ${newShiftData.startHour} - ${newShiftData.endHour} on ${format(newShiftData.start, 'dd/MM/yyyy')}`, {
                position: 'top-right'
            });

            // Close modal and reset state
            setCreateShiftVisible(false);
            setNewShiftData(null);
            setShiftDescription('');

        } catch (error) {
            console.error('Error creating shift:', error);
            toast.error('Error creating shift', { position: 'top-right' });
        } finally {
            setIsUpdating(false);
        }
    };


    const eventStyleGetter = (event) => {
        return {
            style: {
                backgroundColor: event.resource.color,
                borderRadius: '4px',
                opacity: 0.9,
                color: 'white',
                border: '0',
                display: 'block'
            }
        };
    };

    if (loading) {
        return (
            <div className="loading">
                <span className="spinner"></span>
                Loading schedule data...
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            <UserScheduleHeader
                currentUserName={currentUserName}
                currentUserCategory={currentUserCategory}
                currentTime={currentTime}
                currentView={currentView}
                setCurrentView={setCurrentView}
                onEditProfile={() => navigate(`/editprofile/${userId}`, { state: { backTo: '/userschedule' } })}
            />

            {/* Overtime Threshold Alert */}
            {weeklyStats.thresholdCrossed && (
                <div className="mb-4 p-4 rounded border border-orange-300 bg-orange-50 text-orange-800 animate-pulse-soft">
                     You have exceeded the weekly threshold of {overtimeSettings.thresholdHours}h. Overtime hours this week: {weeklyStats.overtimeHours.toFixed(2)}h.
                </div>
            )}

            <WeeklyStatsCard weeklyStats={weeklyStats} overtimeSettings={overtimeSettings} />

            {scheduleData.length === 0 ? (
                <div className="card text-center">
                    <div className="py-8">
                        <h2 className="text-xl font-semibold text-gray-600 mb-4">
                             No Schedule Found
                        </h2>
                        <p className="text-gray-500 mb-6">
                            You don't have any scheduled shifts yet.
                        </p>
                        <button
                            onClick={() => navigate('/schedulizer')}
                            className="btn btn-primary"
                        >
                             Go to Schedule Management
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {currentView === 'table' && (
                        <ScheduleList
                            groupedSchedules={groupedSchedules}
                            scheduleData={scheduleData}
                            quickCheckIn={quickCheckIn}
                            quickCheckOut={quickCheckOut}
                            editInOutTime={editInOutTime}
                            isUpdating={isUpdating}
                        />
                    )}

                    {currentView === 'calendar' && (
                        <CalendarPanel
                            calendarEvents={calendarEvents}
                            eventStyleGetter={eventStyleGetter}
                            handleSelectSlot={handleSelectSlot}
                            handleEventClick={handleEventClick}
                            scheduleData={scheduleData}
                        />
                    )}
                </>
            )}

            {/* Edit Time Modal */}
            {editMenuVisibility && eventToEdit && (
                <div className="modal-overlay" onClick={(e) => { if (!isUpdating && e.currentTarget === e.target) { closeMenuVisibility(e); } }}>
                    <div className="modal" style={{
                        width: window.innerWidth > 768 ? "90%" : "95%",
                        maxWidth: "1400px",
                        minWidth: "500px"
                    }} onClick={(e) => { e.stopPropagation(); }}>
                        <div className="modal-header">
                            <h2 className="modal-title">
                                 Edit Time Entry
                            </h2>
                            <button
                                onClick={closeMenuVisibility}
                                className="modal-close"
                                disabled={isUpdating}
                            >
                                Close
                            </button>
                        </div>

                        <div className="event-details mb-6">
                            <div className="detail-item">
                                <div className="detail-label">Date</div>
                                <div className="detail-value">
                                    {format(
                                        parseDateTime(
                                            eventToEdit.eventDate,
                                            eventToEdit.startHour || '00:00'
                                        ),
                                        'MMMM dd, yyyy'
                                    )}
                                </div>
                            </div>
                            <div className="detail-item">
                                <div className="detail-label">Scheduled Time</div>
                                <div className="detail-value">
                                    {eventToEdit.startHour} - {eventToEdit.endHour}
                                    {' '}
                                    {(overnightEdit || (eventToEdit.endDate && eventToEdit.endDate !== eventToEdit.eventDate)) && (
                                        <span className="text-xs text-gray-500">(next day)</span>
                                    )}
                                </div>
                            </div>
                            {overnightEdit && (
                                <div className="detail-item">
                                    <div className="detail-label">Crosses to</div>
                                    <div className="detail-value">{eventToEdit.endDate || format(addDays(parseDate(eventToEdit.eventDate), 1), 'yyyy-MM-dd')}</div>
                                </div>
                            )}
                            <div className="detail-item">
                                <div className="detail-label">Description</div>
                                <div className="detail-value">{eventToEdit.eventDescription}</div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="form-group">
                                <label className="form-label">
                                     Shift Description
                                </label>
                                <input
                                    type='text'
                                    value={shiftDescription}
                                    onChange={(e) => setShiftDescription(e.target.value)}
                                    className="form-input"
                                    disabled={isUpdating}
                                    placeholder="Describe the shift..."
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">
                                     Start Time
                                </label>
                                <input
                                    type='time'
                                    value={startHour}
                                    onChange={(e) => setStartHour(e.target.value)}
                                    className="form-input"
                                    disabled={isUpdating}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">
                                     End Time
                                </label>
                                <input
                                    type='time'
                                    value={endHour}
                                    onChange={(e) => setEndHour(e.target.value)}
                                    className="form-input"
                                    disabled={isUpdating}
                                />
                            </div>

                            <div className="form-group flex items-center gap-2">
                                <input
                                    id="overnightEdit"
                                    type="checkbox"
                                    className="form-checkbox"
                                    checked={overnightEdit}
                                    onChange={(e) => setOvernightEdit(e.target.checked)}
                                    disabled={isUpdating}
                                />
                                <label htmlFor="overnightEdit" className="form-label !mb-0"> Overnight (ends next day)</label>
                            </div>

                            {startHour && endHour && (
                                <div style={{
                                    backgroundColor: '#e3f2fd',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    border: '1px solid #bbdefb'
                                }}>
                                    <div style={{
                                        fontSize: '14px',
                                        color: '#1565c0',
                                        fontWeight: '500'
                                    }}>
                                         Scheduled Duration: {
                                            (() => {
                                                try {
                                                    const startDate = new Date(`${eventToEdit.eventDate}T${startHour}`);
                                                    let endDate = new Date(`${eventToEdit.eventDate}T${endHour}`);
                                                    if (overnightEdit && endDate <= startDate) {
                                                        endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
                                                    }
                                                    const minutes = differenceInMinutes(endDate, startDate);
                                                    return `${(minutes / 60).toFixed(2)} hours ${overnightEdit ? '(overnight)' : ''}`;
                                                } catch {
                                                    return 'Invalid schedule';
                                                }
                                            })()
                                        }
                                    </div>
                                </div>
                            )}


                            <div className="form-group">
                                <label className="form-label">
                                     Check-In Time
                                </label>
                                <input
                                    type='time'
                                    value={timeCheckIn}
                                    onChange={(e) => setTimeCheckIn(e.target.value)}
                                    className="form-input"
                                    disabled={isUpdating}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">
                                     Check-Out Time
                                </label>
                                <input
                                    type='time'
                                    value={timeCheckOut}
                                    onChange={(e) => setTimeCheckOut(e.target.value)}
                                    className="form-input"
                                    disabled={isUpdating}
                                />
                            </div>

                            <div className="form-group flex items-center gap-2">
                                <input
                                    id="checkOutOvernightEdit"
                                    type="checkbox"
                                    className="form-checkbox"
                                    checked={checkOutOvernightEdit}
                                    onChange={(e) => setCheckOutOvernightEdit(e.target.checked)}
                                    disabled={isUpdating}
                                />
                                <label htmlFor="checkOutOvernightEdit" className="form-label !mb-0"> Check-Out next day</label>
                            </div>

                            {timeCheckIn && timeCheckOut && (
                                <div style={{
                                    backgroundColor: '#e3f2fd',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    border: '1px solid #bbdefb'
                                }}>
                                    <div style={{
                                        fontSize: '14px',
                                        color: '#1565c0',
                                        fontWeight: '500'
                                    }}>
                                         Total Hours: {
                                            (() => {
                                                try {
                                                    let checkInDate = new Date(`${eventToEdit.eventDate}T${timeCheckIn}`);
                                                    let checkOutDate = new Date(`${eventToEdit.eventDate}T${timeCheckOut}`);

                                                    if (checkOutOvernightEdit || checkOutDate <= checkInDate) {
                                                        checkOutDate = new Date(checkOutDate.getTime() + 24 * 60 * 60 * 1000);
                                                    }

                                                    const minutes = differenceInMinutes(checkOutDate, checkInDate);
                                                    return `${(minutes / 60).toFixed(2)} hours ${checkOutOvernightEdit ? '(next day)' : ''}`;
                                                } catch {
                                                    return 'Invalid schedule';
                                                }
                                            })()
                                        }
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-4 mt-6 pt-4 border-t">
                            <button
                                onClick={() => updateDescription(eventToEdit)}
                                className="btn btn-info flex-1"
                                disabled={isUpdating}
                            >
                                {isUpdating ? (
                                    <>
                                        <span className="spinner"></span>
                                        Updating...
                                    </>
                                ) : (
                                    ' Update Description'
                                )}
                            </button>
                            <button
                                onClick={() => updateScheduleTimes(eventToEdit)}
                                className="btn btn-warning flex-1"
                                disabled={isUpdating || !startHour || !endHour}
                            >
                                {isUpdating ? (
                                    <>
                                        <span className="spinner"></span>
                                        Updating...
                                    </>
                                ) : (
                                    ' Update Times'
                                )}
                            </button>
                        </div>

                        <div className="flex gap-4 mt-6">
                            <button
                                onClick={() => checkInTime(eventToEdit)}
                                className="btn btn-success flex-1"
                                disabled={isUpdating || !timeCheckIn}
                            >
                                {isUpdating ? (
                                    <>
                                        <span className="spinner"></span>
                                        Updating...
                                    </>
                                ) : (
                                    ' Update Check-In'
                                )}
                            </button>
                            <button
                                onClick={() => checkOutTime(eventToEdit)}
                                className="btn btn-warning flex-1"
                                disabled={isUpdating || !timeCheckOut}
                            >
                                {isUpdating ? (
                                    <>
                                        <span className="spinner"></span>
                                        Updating...
                                    </>
                                ) : (
                                    ' Update Check-Out'
                                )}
                            </button>
                        </div>
                        <div className="flex gap-4 mt-4">
                            <button
                                onClick={() => checkInTimestampOnly(eventToEdit)}
                                className="btn btn-success flex-1"
                                disabled={isUpdating}
                            >
                                {isUpdating ? (
                                    <>
                                        <span className="spinner"></span>
                                        Updating...
                                    </>
                                ) : (
                                    ' Update Timestamp Check-In'
                                )}
                            </button>
                            <button
                                onClick={() => checkOutTimestampOnly(eventToEdit)}
                                className="btn btn-warning flex-1"
                                disabled={isUpdating}
                            >
                                {isUpdating ? (
                                    <>
                                        <span className="spinner"></span>
                                        Updating...
                                    </>
                                ) : (
                                    ' Update Timestamp Check-Out'
                                )}
                            </button>
                        </div>
                        <div className="flex mt-4">
                            <button
                                onClick={closeMenuVisibility}
                                className="btn btn-secondary flex-1"
                                disabled={isUpdating}
                            >
                                 Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Shift Options Modal */}
            {shiftOptionsVisible && selectedShift && (
                <div className="modal-overlay" onClick={() => { setShiftOptionsVisible(false); setSelectedShift(null); }}>
                    <div className="modal" onClick={(e) => { e.stopPropagation(); }}>
                        <div className="modal-header">
                            <h2 className="modal-title">
                                 Shift Options
                            </h2>
                            <button
                                onClick={() => {
                                    setShiftOptionsVisible(false);
                                    setSelectedShift(null);
                                }}
                                className="modal-close"
                            >
                                Close
                            </button>
                        </div>

                        <div className="event-details mb-6">
                            <div className="detail-item">
                                <div className="detail-label">Date</div>
                                <div className="detail-value">
                                    {format(
                                        parseDateTime(
                                            selectedShift.eventDate,
                                            selectedShift.startHour || '00:00'
                                        ),
                                        'MMMM dd, yyyy'
                                    )}
                                </div>
                            </div>
                            <div className="detail-item">
                                <div className="detail-label">Time</div>
                                <div className="detail-value">
                                    {selectedShift.startHour} - {selectedShift.endHour}
                                    {' '}
                                    {(selectedShift.overnight || (selectedShift.endDate && selectedShift.endDate !== selectedShift.eventDate)) && (
                                        <span className="text-xs text-gray-500">(next day)</span>
                                    )}
                                </div>
                            </div>
                            <div className="detail-item">
                                <div className="detail-label">Description</div>
                                <div className="detail-value">{selectedShift.eventDescription}</div>
                            </div>
                            {selectedShift.checkedInTime && (
                                <div className="detail-item">
                                    <div className="detail-label">Check-In</div>
                                    <div className="detail-value">{selectedShift.checkedInTime}</div>
                                </div>
                            )}
                            {selectedShift.checkedOutTime && (
                                <div className="detail-item">
                                    <div className="detail-label">Check-Out</div>
                                    <div className="detail-value">{selectedShift.checkedOutTime}</div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-4 mt-6">
                            <button
                                onClick={() => editShiftFromCalendar(selectedShift)}
                                className="btn btn-primary flex-1"
                            >
                                 Edit Shift
                            </button>
                            <button
                                onClick={() => deleteShift(selectedShift)}
                                className="btn btn-danger flex-1"
                            >
                                 Delete Shift
                            </button>
                        </div>

                        <div className="flex mt-4">
                            <button
                                onClick={() => {
                                    setShiftOptionsVisible(false);
                                    setSelectedShift(null);
                                }}
                                className="btn btn-secondary flex-1"
                            >
                                 Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create New Shift Modal */}
            {createShiftVisible && newShiftData && (
                <div className="modal-overlay" onClick={() => { if (!isUpdating) { setCreateShiftVisible(false); setNewShiftData(null); setShiftDescription(''); } }}>
                    <div className="modal" onClick={(e) => { e.stopPropagation(); }}>
                        <div className="modal-header">
                            <h2 className="modal-title">
                                 Create New Shift
                            </h2>
                            <button
                                onClick={() => {
                                    setCreateShiftVisible(false);
                                    setNewShiftData(null);
                                    setShiftDescription('');
                                }}
                                className="modal-close"
                                disabled={isUpdating}
                            >
                                Close
                            </button>
                        </div>

                        <div className="event-details mb-6">
                            <div className="detail-item">
                                <div className="detail-label">Date</div>
                                <div className="detail-value">
                                    {format(newShiftData.start, 'MMMM dd, yyyy')}
                                </div>
                            </div>
                            <div className="detail-item">
                                <div className="detail-label">Time</div>
                                <div className="detail-value">
                                    {newShiftData.startHour} - {newShiftData.endHour}
                                    {' '}
                                    {newShiftData.overnight && (
                                        <span className="text-xs text-gray-500">(next day)</span>
                                    )}
                                </div>
                            </div>
                            <div className="detail-item">
                                <div className="detail-label">Duration</div>
                                <div className="detail-value">
                                    {(() => {
                                        const start = parseDateTime(newShiftData.eventDate, newShiftData.startHour);
                                        const endBase = newShiftData.overnight && newShiftData.endDate
                                            ? newShiftData.endDate
                                            : newShiftData.eventDate;
                                        let end = parseDateTime(endBase, newShiftData.endHour);
                                        if (newShiftData.overnight && end <= start) {
                                            end = parseDateTime(format(addDays(parseDate(newShiftData.eventDate), 1), 'yyyy-MM-dd'), newShiftData.endHour);
                                        }
                                        return (differenceInMinutes(end, start) / 60).toFixed(2);
                                    })()} hours
                                </div>
                            </div>
                        </div>

                        <div className="form-group mb-6">
                            <label className="form-label">
                                 Shift Description
                            </label>
                            <input
                                type='text'
                                value={shiftDescription}
                                onChange={(e) => setShiftDescription(e.target.value)}
                                className="form-input"
                                disabled={isUpdating}
                                placeholder="Describe the shift (e.g.: Morning shift, Meeting, etc.)"
                                autoFocus
                            />
                        </div>

                        <div className="flex gap-4 mt-6">
                            <button
                                onClick={createShiftWithDescription}
                                className="btn btn-primary flex-1"
                                disabled={isUpdating}
                            >
                                {isUpdating ? (
                                    <>
                                        <span className="spinner"></span>
                                        Creating...
                                    </>
                                ) : (
                                    ' Create Shift'
                                )}
                            </button>
                            <button
                                onClick={() => {
                                    setCreateShiftVisible(false);
                                    setNewShiftData(null);
                                    setShiftDescription('');
                                }}
                                className="btn btn-secondary"
                                disabled={isUpdating}
                            >
                                     Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Navigation */}
            <div className="card mt-6">
                <div className="flex justify-between items-center">
                    <button
                        onClick={() => navigate('/schedulizer')}
                        className="btn btn-secondary"
                    >
                         Back to Schedule Management
                    </button>
                    <div className="text-sm text-gray-500">
                        Total Entries: {scheduleData.length}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default UserSchedule
