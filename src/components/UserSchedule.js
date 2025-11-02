

import { useEffect, useState, useMemo } from 'react';
import { dbFirestore } from '../connections/ConnFirebaseServices'
import { collection, onSnapshot, query, orderBy, doc, updateDoc, getDoc, addDoc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import {
    format,
    differenceInMinutes,
    startOfWeek,
    endOfWeek,
    isToday,
    isPast,
    addDays,
    startOfDay,
    endOfDay,
    isSameDay
} from 'date-fns';
import {
    groupShiftsByDate,
    getShiftStatus,
    parseDate,
    parseDateTime
} from '../utils/scheduleUtils';

const localizer = momentLocalizer(moment);

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

        const hourlyRate = parseFloat(userData.hourlyWage) || 0;
        if (hourlyRate <= 0) return;

        const threshold = parseFloat(overtimeSettings.thresholdHours) || 9999;
        const overtimePercent = parseFloat(overtimeSettings.overtimePercent) || 0;
        const overtimeMultiplier = 1 + (overtimePercent / 100);

        const newCache = { ...earningsCache };
        const writes = [];

        const allDates = Object.keys(groupedSchedules).sort();

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

                const regularPay = regularHours * hourlyRate;
                const overtimePay = overtimeHours * hourlyRate * overtimeMultiplier;
                const dayEarnings = worked > 0 ? +(regularPay + overtimePay).toFixed(2) : 0;
                const totalHours = +worked.toFixed(2);

                const cacheEntry = earningsCache[dateKey];
                const signature = `${totalHours}|${dayEarnings}|${regularHours.toFixed(2)}|${overtimeHours.toFixed(2)}|${scheduledHours.toFixed(2)}`;
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
                        hourlyWageSnapshot: hourlyRate,
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

            // status / color (copia exacta de tu lógica original)
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

            const baseTitle = schedule.eventDescription + (schedule.overnight ? ' (🌙)' : '');

            // caso simple: no cruza de día
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
        if (!reg || !reg.id || !timeCheckIn) {
            toast.error("Please select a valid time for check-in");
            return;
        }

        setIsUpdating(true);
        try {
            await updateDoc(doc(dbFirestore, 'users', userId, "UserSchedule", reg.id), {
                checkedInTime: timeCheckIn,
                checkInTimestamp: new Date(),
                eventDescription: shiftDescription || reg.eventDescription
            });
            toast.success("✅ Checked in successfully!");
        } catch (error) {
            toast.error("❌ Failed to check in!");
        } finally {
            setIsUpdating(false);
        }
    }

    async function checkOutTime(reg) {
        if (!reg || !reg.id || !timeCheckOut) {
            toast.error("Please select a valid time for check-out");
            return;
        }

        const checkInHour = timeCheckIn || reg.checkedInTime;
        if (!checkInHour) {
            toast.error("Check-in time is required before check-out");
            return;
        }

        let checkInDate = new Date(`${reg.eventDate}T${checkInHour}`);
        let checkOutDate = new Date(`${reg.eventDate}T${timeCheckOut}`);

        if (checkOutOvernightEdit || checkOutDate <= checkInDate) {
            checkOutDate = new Date(checkOutDate.getTime() + 24 * 60 * 60 * 1000);
        }
        const totalMinutes = differenceInMinutes(checkOutDate, checkInDate);
        if (totalMinutes <= 0) {
            toast.error("Check-out time must be after check-in time");
            return;
        }
        const totalHours = (totalMinutes / 60).toFixed(2);

        setIsUpdating(true);
        try {
            await updateDoc(doc(dbFirestore, 'users', userId, "UserSchedule", reg.id), {
                checkedOutTime: timeCheckOut,
                totalHoursDay: totalHours,
                checkOutTimestamp: new Date(),
                status: 'completed',
                eventDescription: shiftDescription || reg.eventDescription
            });
            toast.success("✅ Checked out successfully!");
            setEditMenuVisibility(false);
        } catch (error) {
            toast.error("❌ Failed to check out!");
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
            toast.success("✅ Description updated successfully!");
        } catch (error) {
            toast.error("❌ Error updating description!");
        } finally {
            setIsUpdating(false);
        }
    }

    async function updateScheduleTimes(reg) {
        if (!reg || !reg.id || !startHour || !endHour) {
            toast.error("Please select valid times");
            return;
        }
        const startDate = new Date(`${reg.eventDate}T${startHour}`);
        let endDate = new Date(`${reg.eventDate}T${endHour}`);
        let crosses = false;
        if (overnightEdit) {
            if (endDate <= startDate) {
                endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
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
            const exStart = new Date(`${shift.eventDate}T${shift.startHour}`);
            let exEnd = new Date(`${shift.eventDate}T${shift.endHour}`);
            if (shift.endDate && shift.endDate !== shift.eventDate) {
                exEnd = new Date(`${shift.endDate}T${shift.endHour}`);
            } else if (exEnd <= exStart) {
                exEnd = new Date(exEnd.getTime() + 24 * 60 * 60 * 1000);
            }
            return (startDate < exEnd && endDate > exStart);
        });

        if (overlappingShifts.length > 0) {
            const overlappingShift = overlappingShifts[0];
            toast.error(`⚠️ Schedule conflict: The new schedule would overlap with the shift from ${overlappingShift.startHour} to ${overlappingShift.endHour} - "${overlappingShift.eventDescription}"`, {
                position: 'top-right',
                autoClose: 6000
            });
            return;
        }

        setIsUpdating(true);
        try {
            await updateDoc(doc(dbFirestore, 'users', userId, "UserSchedule", reg.id), {
                startHour: startHour,
                endHour: endHour,
                endDate: crosses ? format(addDays(new Date(reg.eventDate), 1), 'yyyy-MM-dd') : reg.eventDate,
                overnight: crosses,
                eventDescription: shiftDescription || reg.eventDescription
            });
            toast.success("✅ Shift times updated successfully!");
        } catch (error) {
            toast.error("❌ Error updating shift times!");
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
        // Validate minimum duration (15 minutes)
        const durationMinutes = differenceInMinutes(end, start);
        if (durationMinutes < 15) {
            toast.error('The shift must last at least 15 minutes', { position: 'top-right' });
            return;
        }

        // Format dates for the new shift
        const eventDate = format(start, 'yyyy-MM-dd');
        const startHour = format(start, 'HH:mm');
        const endHour = format(end, 'HH:mm');

        // Quick check for overlapping shifts before opening modal
        const overlappingShifts = scheduleData.filter(shift => {
            if (shift.eventDate !== eventDate) return false;

            const existingStartTime = new Date(`${shift.eventDate}T${shift.startHour}`);
            const existingEndTime = new Date(`${shift.eventDate}T${shift.endHour}`);

            // Check if there's any overlap
            return (start < existingEndTime && end > existingStartTime);
        });

        if (overlappingShifts.length > 0) {
            const overlappingShift = overlappingShifts[0];
            toast.error(`⚠️ Cannot create shift: It would overlap with the existing shift from ${overlappingShift.startHour} to ${overlappingShift.endHour} - "${overlappingShift.eventDescription}"`, {
                position: 'top-right',
                autoClose: 6000
            });
            return;
        }

        // Set up data for the modal
        setNewShiftData({
            eventDate,
            startHour,
            endHour,
            start,
            end
        });

        setShiftDescription('');
        setCreateShiftVisible(true);
    };

    // ⬇⬇⬇ ESTA ES LA FUNCIÓN QUE TE FALTÓ EN LA VERSIÓN PEGADA
    const createShiftWithDescription = async () => {
        if (!newShiftData) return;

        try {
            setIsUpdating(true);

            // Check for overlapping shifts
            const newStartTime = new Date(`${newShiftData.eventDate}T${newShiftData.startHour}`);
            const newEndTime = new Date(`${newShiftData.eventDate}T${newShiftData.endHour}`);

            // Find overlapping shifts on the same date
            const overlappingShifts = scheduleData.filter(shift => {
                if (shift.eventDate !== newShiftData.eventDate) return false;

                const existingStartTime = new Date(`${shift.eventDate}T${shift.startHour}`);
                const existingEndTime = new Date(`${shift.eventDate}T${shift.endHour}`);

                // Check if there's any overlap
                return (newStartTime < existingEndTime && newEndTime > existingStartTime);
            });

            if (overlappingShifts.length > 0) {
                const overlappingShift = overlappingShifts[0];
                toast.error(`⚠️ Schedule conflict: There is already a shift from ${overlappingShift.startHour} to ${overlappingShift.endHour} - "${overlappingShift.eventDescription}"`, {
                    position: 'top-right',
                    autoClose: 6000
                });
                return;
            }

            // Create new shift object
            const newShift = {
                userId: userId,
                eventDate: newShiftData.eventDate,
                startHour: newShiftData.startHour,
                endHour: newShiftData.endHour,
                eventDescription: shiftDescription || 'New shift',
                checkedInTime: '',
                checkedOutTime: '',
                totalHoursDay: ''
            };

            // Add to Firebase
            const scheduleCollection = collection(dbFirestore, 'users', userId, 'UserSchedule');
            await addDoc(scheduleCollection, newShift);

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
    // ⬆⬆⬆ ESTA PARTE TIENE QUE EXISTIR DENTRO DEL COMPONENTE UserSchedule()

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
            {/* Header with Live Clock */}
            <div className="card mb-6">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h1 className="card-title">📅 Employee Schedule - {currentUserName}</h1>
                        <p className="card-subtitle">
                            {currentUserCategory && `${currentUserCategory} • `}Track your work schedule and time entries
                        </p>
                    </div>
                    <div className="text-right">
                        <div className="current-time">
                            {format(currentTime, 'HH:mm:ss')}
                        </div>
                        <div className="current-date">
                            {format(currentTime, 'EEEE, MMMM dd, yyyy')}
                        </div>
                    </div>
                </div>

                {/* View Toggle */}
                <div className="flex gap-2">
                    <button
                        onClick={() => setCurrentView('table')}
                        className={`btn ${currentView === 'table' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        📋 Table View
                    </button>
                    <button
                        onClick={() => setCurrentView('calendar')}
                        className={`btn ${currentView === 'calendar' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        📅 Calendar View
                    </button>
                </div>
            </div>

            {/* Overtime Threshold Alert */}
            {weeklyStats.thresholdCrossed && (
                <div className="mb-4 p-4 rounded border border-orange-300 bg-orange-50 text-orange-800 animate-pulse-soft">
                    ⚠️ You have exceeded the weekly threshold of {overtimeSettings.thresholdHours}h. Overtime hours this week: {weeklyStats.overtimeHours.toFixed(2)}h.
                </div>
            )}

            {/* Weekly Statistics */}
            <div className="stats-grid mb-6">
                <div className="stat-card">
                    <div className="stat-value">{weeklyStats.scheduledHours}</div>
                    <div className="stat-label">Scheduled Hours</div>
                </div>
                <div className="stat-card success">
                    <div className="stat-value">{weeklyStats.workedHours}</div>
                    <div className="stat-label">Worked Hours {weeklyStats.overtimeHours > 0 && (
                        <span className="block text-xs text-green-700 mt-1">Reg {weeklyStats.regularHours}h • OT {weeklyStats.overtimeHours}h</span>
                    )}</div>
                </div>
                <div className="stat-card warning">
                    <div className="stat-value">{weeklyStats.efficiency}%</div>
                    <div className="stat-label">Efficiency</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">${weeklyStats.weeklyEarnings}</div>
                    <div className="stat-label">Weekly Earnings (CAD)
                        {(weeklyStats.overtimeEarnings > 0 || weeklyStats.regularEarnings > 0) && (
                            <span className="block text-xs text-gray-600 mt-1">
                                Reg ${weeklyStats.regularEarnings.toFixed(2)}{weeklyStats.overtimeEarnings > 0 && ` • OT $${weeklyStats.overtimeEarnings.toFixed(2)}`}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {scheduleData.length === 0 ? (
                <div className="card text-center">
                    <div className="py-8">
                        <h2 className="text-xl font-semibold text-gray-600 mb-4">
                            📅 No Schedule Found
                        </h2>
                        <p className="text-gray-500 mb-6">
                            You don't have any scheduled shifts yet.
                        </p>
                        <button
                            onClick={() => navigate('/schedulizer')}
                            className="btn btn-primary"
                        >
                            📋 Go to Schedule Management
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {currentView === 'table' && (
                        <div className="card animate-slide-in">
                            <div className="card-header">
                                <h2 className="card-title">📊 Schedules by Date</h2>
                                <p className="text-sm text-gray-600">
                                    Shifts organized by day with daily totals
                                </p>
                            </div>

                            <div className="card-body h-48 overflow-y-auto">
                                <div className="space-y-6">
                                    {Object.keys(groupedSchedules)
                                        .sort((a, b) => a.localeCompare(b))
                                        .map(date => {
                                            const dayData = groupedSchedules[date];
                                            const shifts = dayData.shifts;
                                            const totals = dayData.totals;
                                            const dateObj = parseDate(date);
                                            const isTodayDate = isToday(dateObj);

                                            return (
                                                <div
                                                    key={date}
                                                    id={`date-${date}`}
                                                    className={`border rounded-lg overflow-hidden ${isTodayDate ? 'border-blue-300 bg-blue-50' : 'border-gray-200'
                                                        }`}
                                                >
                                                    {/* Date Header */}
                                                    <div className={`px-4 py-3 border-b ${isToday ? 'bg-blue-100 border-blue-200' : 'bg-gray-50 border-gray-200'
                                                        }`}>
                                                        <div className="flex justify-between items-center">
                                                            <div>
                                                                <h3 className="font-semibold text-lg">
                                                                    {isTodayDate && '🌟 '}
                                                                    {format(dateObj, 'EEEE, dd/MM/yyyy')}
                                                                    {isTodayDate && ' (Today)'}
                                                                </h3>
                                                                <p className="text-sm text-gray-600">
                                                                    {totals.totalShifts} scheduled shift{totals.totalShifts !== 1 ? 's' : ''}
                                                                </p>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="text-sm text-gray-600">
                                                                    📅 {totals.scheduledHours}h scheduled
                                                                </div>
                                                                <div className="text-sm font-medium text-green-600">
                                                                    ✅ {totals.workedHours}h worked
                                                                </div>
                                                                <div className="text-xs text-gray-500">
                                                                    {totals.completedShifts}/{totals.totalShifts} completed
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Shifts for this date */}
                                                    <div className="divide-y divide-gray-100">
                                                        {shifts.map((shift, index) => {
                                                            const statusInfo = getShiftStatus(shift);
                                                            const canCheckIn = isTodayDate && !shift.checkedInTime;
                                                            const canCheckOut = shift.checkedInTime && !shift.checkedOutTime;

                                                            return (
                                                                <div key={shift.id} className="px-4 py-3 hover:bg-gray-50">
                                                                    <div className="flex justify-between items-center">
                                                                        <div className="flex-1">
                                                                            <div className="flex items-center gap-3 mb-2">
                                                                                <span className="text-lg font-mono font-semibold">
                                                                                    {shift.startHour} - {shift.endHour}{shift.isContinuation ? ' (cont.)' : ''}{(shift.overnight || shift.isContinuation) && ' 🌙'}
                                                                                </span>
                                                                                <span className={`px-2 py-1 rounded text-sm font-medium ${statusInfo.bgColor} ${statusInfo.textColor}`}>
                                                                                    {statusInfo.label}
                                                                                </span>
                                                                                <span className="text-sm text-gray-500">
                                                                                    ({(() => {
                                                                                        try {
                                                                                            const start = parseDateTime(shift.eventDate, shift.startHour);
                                                                                            let end;
                                                                                            if (shift.isContinuation) {
                                                                                                end = parseDateTime(shift.eventDate, shift.endHour);
                                                                                            } else if (shift.endDate && shift.endDate !== shift.eventDate) {
                                                                                                const firstDayEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999);
                                                                                                end = firstDayEnd;
                                                                                            } else {
                                                                                                end = parseDateTime(shift.eventDate, shift.endHour);
                                                                                                if ((shift.overnight || shift.endHour <= shift.startHour) && !shift.isContinuation) {
                                                                                                    const firstDayEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999);
                                                                                                    end = firstDayEnd;
                                                                                                }
                                                                                            }
                                                                                            const hrs = differenceInMinutes(end, start) / 60;
                                                                                            return `${hrs.toFixed(2)}h scheduled`;
                                                                                        } catch { return '—'; }
                                                                                    })()})
                                                                                </span>
                                                                            </div>

                                                                            <div className="text-gray-700 mb-2">
                                                                                📝 {shift.eventDescription}
                                                                            </div>

                                                                            <div className="flex gap-6 text-sm">
                                                                                <div className="flex items-center gap-1">
                                                                                    <span>🕐 Check-in:</span>
                                                                                    <span className={shift.checkedInTime ? 'text-green-600 font-mono' : 'text-gray-400'}>
                                                                                        {shift.checkedInTime || 'Not recorded'}
                                                                                    </span>
                                                                                </div>
                                                                                <div className="flex items-center gap-1">
                                                                                    <span>🏁 Check-out:</span>
                                                                                    <span className={shift.checkedOutTime ? 'text-blue-600 font-mono' : 'text-gray-400'}>
                                                                                        {shift.checkedOutTime || 'Not recorded'}
                                                                                    </span>
                                                                                </div>
                                                                                <div className="flex items-center gap-1">
                                                                                    <span>⏱️ Total:</span>
                                                                                    <span className={shift.totalHoursDay ? 'text-green-600 font-semibold' : 'text-gray-400'}>
                                                                                        {shift.totalHoursDay ? `${shift.totalHoursDay}h` : '-'}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        <div className="flex gap-2 ml-4">
                                                                            {canCheckIn && (
                                                                                <button
                                                                                    onClick={() => quickCheckIn(shift)}
                                                                                    className="btn btn-success btn-sm"
                                                                                    disabled={isUpdating}
                                                                                    title="Quick Check-In"
                                                                                >
                                                                                    🕐 Entrar
                                                                                </button>
                                                                            )}
                                                                            {canCheckOut && (
                                                                                <button
                                                                                    onClick={() => quickCheckOut(shift)}
                                                                                    className="btn btn-warning btn-sm"
                                                                                    disabled={isUpdating}
                                                                                    title="Quick Check-Out"
                                                                                >
                                                                                    🏁 Salir
                                                                                </button>
                                                                            )}
                                                                            {!shift.isContinuation && (
                                                                                <button
                                                                                    onClick={() => editInOutTime(shift)}
                                                                                    className="btn btn-primary btn-sm"
                                                                                    title="Edit Times"
                                                                                >
                                                                                    ✏️ Edit
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {/* Breaks */}
                                                                    {index < shifts.length - 1 && (
                                                                        (() => {
                                                                            const nextShift = shifts[index + 1];
                                                                            const currentEnd = new Date(`${shift.eventDate}T${shift.endHour}`);
                                                                            const nextStart = new Date(`${nextShift.eventDate}T${nextShift.startHour}`);
                                                                            const breakMinutes = differenceInMinutes(nextStart, currentEnd);

                                                                            if (breakMinutes > 0) {
                                                                                return (
                                                                                    <div className="mt-3 pt-2 border-t border-dashed border-gray-300">
                                                                                        <div className={`text-xs text-center py-1 px-2 rounded ${breakMinutes >= 30
                                                                                            ? 'bg-green-100 text-green-700'
                                                                                            : 'bg-orange-100 text-orange-700'
                                                                                            }`}>
                                                                                            ⏸️ Break: {Math.floor(breakMinutes / 60)}h {breakMinutes % 60}m
                                                                                            {breakMinutes < 30 && ' (⚠️ Less than 30 min recommended)'}
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            }
                                                                            return null;
                                                                        })()
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* Daily totals footer */}
                                                    {totals.totalShifts > 1 && (
                                                        <div className="px-4 py-3 bg-gray-50 border-t">
                                                            <div className="flex justify-between items-center text-sm">
                                                                <div className="text-gray-600">
                                                                    📊 Day Total ({totals.totalShifts} shifts):
                                                                </div>
                                                                <div className="flex gap-4 font-medium">
                                                                    <span className="text-blue-600">
                                                                        📅 {totals.scheduledHours}h scheduled
                                                                    </span>
                                                                    <span className="text-green-600">
                                                                        ✅ {totals.workedHours}h worked
                                                                    </span>
                                                                    <span className={totals.workedHours > totals.scheduledHours ? 'text-orange-600' : 'text-gray-600'}>
                                                                        📈 {totals.scheduledHours > 0 ?
                                                                            `${((totals.workedHours / totals.scheduledHours) * 100).toFixed(1)}%` :
                                                                            '0%'} efficiency
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                    {Object.keys(groupedSchedules).length === 0 && (
                                        <div className="text-center py-8 text-gray-500">
                                            📅 No scheduled shifts
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {currentView === 'calendar' && (
                        <div className="card animate-slide-in">
                            <div className="card-header">
                                <h2 className="card-title">📅 Calendar View</h2>
                            </div>

                            {/* Calendar Legend */}
                            <div className="calendar-legend mb-4">
                                <h3 className="legend-title">Schedule Status</h3>
                                <div className="legend-items">
                                    <div className="legend-item">
                                        <div className="legend-color" style={{ backgroundColor: '#10b981' }}></div>
                                        <span>Completed</span>
                                    </div>
                                    <div className="legend-item">
                                        <div className="legend-color" style={{ backgroundColor: '#f59e0b' }}></div>
                                        <span>In Progress</span>
                                    </div>
                                    <div className="legend-item">
                                        <div className="legend-color" style={{ backgroundColor: '#2563eb' }}></div>
                                        <span>Scheduled</span>
                                    </div>
                                    <div className="legend-item">
                                        <div className="legend-color" style={{ backgroundColor: '#ef4444' }}></div>
                                        <span>Missed</span>
                                    </div>
                                </div>
                            </div>

                            {/* Create Shift Instructions */}
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                                <div className="flex items-center gap-2 text-blue-800">
                                    <span className="text-lg">✨</span>
                                    <span className="font-medium">Quick Shift Creation:</span>
                                    <span className="text-sm">Click and drag on the calendar to create a new shift</span>
                                </div>
                            </div>

                            <Calendar
                                localizer={localizer}
                                events={calendarEvents}
                                startAccessor="start"
                                endAccessor="end"
                                style={{ height: 600 }}
                                eventPropGetter={eventStyleGetter}
                                views={['month', 'week', 'day', 'agenda']}
                                defaultView="week"
                                step={15}
                                timeslots={4}
                                min={new Date(0, 0, 0, 0, 0, 0)}        // 00:00
                                max={new Date(0, 0, 0, 23, 59, 0)}      // 23:59
                                selectable={true}
                                onSelectSlot={handleSelectSlot}
                                formats={{
                                    timeGutterFormat: 'HH:mm',
                                    eventTimeRangeFormat: ({ start, end }) =>
                                        `${format(start, 'HH:mm')} - ${format(end, 'HH:mm')}`
                                }}
                                onSelectEvent={(event) => {
                                    const schedule = scheduleData.find(s => s.id === event.id);
                                    if (schedule) {
                                        handleEventClick(schedule);
                                    }
                                }}
                            />

                        </div>
                    )}
                </>
            )}

            {/* Edit Time Modal */}
            {editMenuVisibility && eventToEdit && (
                <div className="modal-overlay" >
                    <div className="modal" style={{
                        width: window.innerWidth > 768 ? "90%" : "95%",
                        maxWidth: "1400px",
                        minWidth: "500px"
                    }}>
                        <div className="modal-header">
                            <h2 className="modal-title">
                                🕐 Edit Time Entry
                            </h2>
                            <button
                                onClick={closeMenuVisibility}
                                className="modal-close"
                                disabled={isUpdating}
                            >
                                ✕
                            </button>
                        </div>

                        <div className="event-details mb-6">
                            <div className="detail-item">
                                <div className="detail-label">Date</div>
                                <div className="detail-value">
                                    {format(new Date(eventToEdit.eventDate), 'MMMM dd, yyyy')}
                                </div>
                            </div>
                            <div className="detail-item">
                                <div className="detail-label">Scheduled Time</div>
                                <div className="detail-value">
                                    {eventToEdit.startHour} - {eventToEdit.endHour} {overnightEdit && '🌙'}
                                </div>
                            </div>
                            {overnightEdit && (
                                <div className="detail-item">
                                    <div className="detail-label">Crosses to</div>
                                    <div className="detail-value">{eventToEdit.endDate || format(addDays(new Date(eventToEdit.eventDate), 1), 'yyyy-MM-dd')}</div>
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
                                    📝 Shift Description
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
                                    🕒 Start Time
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
                                    🕘 End Time
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
                                <label htmlFor="overnightEdit" className="form-label !mb-0">🌙 Overnight (ends next day)</label>
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
                                        ⏰ Scheduled Duration: {
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
                                    �🕐 Check-In Time
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
                                    🏁 Check-Out Time
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
                                <label htmlFor="checkOutOvernightEdit" className="form-label !mb-0">🌙 Check-Out al día siguiente</label>
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
                                        📊 Total Hours: {
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
                                    '📝 Update Description'
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
                                    '⏰ Update Times'
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
                                    '🕐 Update Check-In'
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
                                    '🏁 Update Check-Out'
                                )}
                            </button>
                            <button
                                onClick={closeMenuVisibility}
                                className="btn btn-secondary"
                                disabled={isUpdating}
                            >
                                ❌ Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Shift Options Modal */}
            {shiftOptionsVisible && selectedShift && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2 className="modal-title">
                                ⚙️ Shift Options
                            </h2>
                            <button
                                onClick={() => {
                                    setShiftOptionsVisible(false);
                                    setSelectedShift(null);
                                }}
                                className="modal-close"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="event-details mb-6">
                            <div className="detail-item">
                                <div className="detail-label">Date</div>
                                <div className="detail-value">
                                    {format(new Date(selectedShift.eventDate), 'MMMM dd, yyyy')}
                                </div>
                            </div>
                            <div className="detail-item">
                                <div className="detail-label">Time</div>
                                <div className="detail-value">
                                    {selectedShift.startHour} - {selectedShift.endHour}
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
                                ✏️ Edit Shift
                            </button>
                            <button
                                onClick={() => deleteShift(selectedShift)}
                                className="btn btn-danger flex-1"
                            >
                                🗑️ Delete Shift
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
                                ❌ Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create New Shift Modal */}
            {createShiftVisible && newShiftData && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2 className="modal-title">
                                ➕ Create New Shift
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
                                ✕
                            </button>
                        </div>

                        <div className="event-details mb-6">
                            <div className="detail-item">
                                <div className="detail-label">Date</div>
                                <div className="detail-value">
                                    {format(new Date(newShiftData.eventDate), 'MMMM dd, yyyy')}
                                </div>
                            </div>
                            <div className="detail-item">
                                <div className="detail-label">Time</div>
                                <div className="detail-value">
                                    {newShiftData.startHour} - {newShiftData.endHour}
                                </div>
                            </div>
                            <div className="detail-item">
                                <div className="detail-label">Duration</div>
                                <div className="detail-value">
                                    {(differenceInMinutes(newShiftData.end, newShiftData.start) / 60).toFixed(2)} hours
                                </div>
                            </div>
                        </div>

                        <div className="form-group mb-6">
                            <label className="form-label">
                                📝 Shift Description
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
                                    '✅ Create Shift'
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
                                ❌ Cancelar
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
                        ← Back to Schedule Management
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
