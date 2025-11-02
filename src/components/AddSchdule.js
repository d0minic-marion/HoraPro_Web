
import { useState, useEffect, useMemo } from 'react';
import { dbFirestore } from '../connections/ConnFirebaseServices'
import { 
    collection,
    addDoc,
    onSnapshot,
    query,
    orderBy,
    doc,
    Timestamp,
    updateDoc,
    getDoc,
    setDoc,
    getDocs,
    where,
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import { 
    format, 
    startOfWeek, 
    endOfWeek, 
    isWeekend,
    differenceInHours,
    addHours,
    addDays,
    parseISO,
    isAfter,
    isBefore
} from 'date-fns';
import { 
    validateShiftOverlap, 
    groupShiftsByDate,
    parseDateTime
} from '../utils/scheduleUtils';

const localizer = momentLocalizer(moment);

/* -----------------------------------------------------------
   TIME AND HOURS CALC HELPERS
----------------------------------------------------------- */

/**
 * Parse multiple possible time formats into { h, m }.
 * Supports:
 *  - "03:00", "3:00"
 *  - "22:15"
 *  - "3.00" -> 03:00
 *  - "10.5" -> 10:30
 *  - "7"    -> 07:00
 */
function parseHHMM(str) {
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
function diffHours(dateStart, dateEnd) {
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
function computeWorkedHoursForShift(shiftData) {
    if (!shiftData) return null;

    const {
        checkInTimestamp,
        checkOutTimestamp,
        checkedInTime,
        checkedOutTime,
        overnight
    } = shiftData;

    // 1. Highest priority: Timestamp pair
    if (
        checkInTimestamp && checkOutTimestamp &&
        typeof checkInTimestamp.toDate === 'function' &&
        typeof checkOutTimestamp.toDate === 'function'
    ) {
        const startDate = checkInTimestamp.toDate();
        const endDate   = checkOutTimestamp.toDate();
        const hours = diffHours(startDate, endDate);
        if (hours >= 0) {
            return Number(hours.toFixed(2));
        }
    }

    // 2. Fallback: HH:mm style
    const startParsed = parseHHMM(checkedInTime);
    const endParsed   = parseHHMM(checkedOutTime);

    if (startParsed && endParsed) {
        let startTotalMin = startParsed.h * 60 + startParsed.m;
        let endTotalMin   = endParsed.h * 60 + endParsed.m;

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
 * - If both checkin + checkout present → "completed"
 * - Else if has checkIn but no checkOut → "in_progress"
 * - Else → "scheduled"
 */
function deriveShiftStatus(shiftData) {
    const { checkedInTime, checkedOutTime, checkInTimestamp, checkOutTimestamp } = shiftData || {};

    const hasIn  = !!checkedInTime || !!checkInTimestamp;
    const hasOut = !!checkedOutTime || !!checkOutTimestamp;

    if (hasIn && hasOut) return 'completed';
    if (hasIn && !hasOut) return 'in_progress';
    return 'scheduled';
}

/* -----------------------------------------------------------
   WEEKLY OVERTIME / EARNINGS HELPERS
----------------------------------------------------------- */

/**
 * Dado un rango de semana (monday->sunday) y TODOS los shifts del usuario
 * en esa semana, calculamos para CADA día:
 *  - scheduledHours
 *  - totalHours (sum of totalHoursDay)
 *
 * Luego asignamos regularHours / overtimeHours / overtimeApplied
 * de manera ACUMULADA semanal (>40h).
 *
 * Guardamos cada día en users/{uid}/RecordEarnings/{YYYY-MM-DD}.
 *
 * Notas de modelo:
 * - overtimeThreshold = 40 (horas semanales)
 * - overtimePercent   = 50 (50% extra) -> internamente 1.5x
 * - hourlyWageSnapshot = user.hourlyWage actual
 *
 * IMPORTANTE:
 * Esta función recalcula la SEMANA ENTERA cada vez, no solo el día editado.
 */
async function syncWeeklyEarningsForUserWeek({
    userId,
    userHourlyWage,
    weekStartDate, // Date obj (monday)
    weekEndDate,   // Date obj (sunday)
}) {
    // 1. Traer los shifts de esa semana desde Firestore
    //    (para ser robustos, hacemos query por eventDate >= weekStart && <= weekEnd)
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

    // Construimos un mapa dateStr -> { scheduledHours, totalHours, shifts: [...] }
    // Inicializamos cada día de la semana para asegurar doc diario aunque 0 horas.
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

        // scheduledHours = suma de duration (lo planificado)
        const planned = typeof data.duration === 'number' ? data.duration : 0;
        dayMap[dStr].scheduledHours += planned;

        // totalHours = suma de totalHoursDay (lo real)
        const actual = typeof data.totalHoursDay === 'number' ? data.totalHoursDay : 0;
        dayMap[dStr].totalHours += actual;

        dayMap[dStr].shifts.push(data);
    });

    // 2. Asignar regular vs overtime acumulando en orden cronológico.
    //    Recorremos los días Monday->Sunday, mantenemos contador acumulado de horas regulares.
    const OVERTIME_THRESHOLD_WEEK = 40; // horas
    const OVERTIME_EXTRA_PERCENT  = 50; // guardamos "50" en Firestore
    const OVERTIME_MULTIPLIER     = 1.5; // para calcular paga OT

    let runningTotalRegularEligible = 0;

    cursor = new Date(weekStartDate);
    while (!isAfter(cursor, weekEndDate)) {
        const dStr = format(cursor, 'yyyy-MM-dd');
        const dayInfo = dayMap[dStr];

        // Horas reales este día:
        const dayHours = dayInfo.totalHours; // e.g. 10.42
        let regularHoursForDay = 0;
        let overtimeHoursForDay = 0;

        if (dayHours > 0) {
            // ¿Cuánto espacio queda antes de cruzar 40h semanales?
            const remainingRegularCapacity = Math.max(OVERTIME_THRESHOLD_WEEK - runningTotalRegularEligible, 0);

            if (dayHours <= remainingRegularCapacity) {
                // Todo este día aún cuenta como regular
                regularHoursForDay = dayHours;
                overtimeHoursForDay = 0;
            } else {
                // Parte va a regular, el resto es OT
                regularHoursForDay = remainingRegularCapacity;
                overtimeHoursForDay = dayHours - remainingRegularCapacity;
            }

            // Actualizar el acumulado semanal de horas regulares reconocidas
            runningTotalRegularEligible += regularHoursForDay;
        }

        // Calculamos paga:
        // regular se paga 1.0x, overtime a 1.5x
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
            overtimePercent: OVERTIME_EXTRA_PERCENT,   // guardamos 50 como en tu BD actual
            overtimeThreshold: OVERTIME_THRESHOLD_WEEK, // guardamos 40 como en tu BD actual
            dayEarnings,
            noWorkRecorded: dayInfo.totalHours === 0,
            updatedAt: Timestamp.now()
        };

        // Escribimos/merge en users/{uid}/RecordEarnings/{dStr}
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

/* -----------------------------------------------------------
   SHIFT SYNC HELPERS
   (status + totalHoursDay)
----------------------------------------------------------- */

/**
 * Ensure totalHoursDay AND status are up to date for a given shift.
 * Only writes if there's an actual difference from Firestore data.
 */
async function syncShiftDerivedFieldsIfNeeded(shiftRef, shiftData) {
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

/* -----------------------------------------------------------
   REACT COMPONENT
----------------------------------------------------------- */

function AddSchedule() {
    const navigate = useNavigate()

    const [colUsersData, setColUsersData] = useState([])
    const [loading, setLoading] = useState(true)
    const [calendarEvents, setCalendarEvents] = useState([])
    const [selectedUser, setSelectedUser] = useState(null)
    const [currentView, setCurrentView] = useState('lista');

    // Form states
    const [eventDate, setEventDate] = useState('')
    const [startHour, setStartHour] = useState('')
    const [endHour, setEndHour] = useState('')
    const [eventDescription, setEventDescription] = useState('')
    const [selectedUserId, setSelectedUserId] = useState('')
    const [selectedUserName, setSelectedUserName] = useState('')
    const [visibilitySchdForm, setVisibilitySchdForm] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [userDailySchedules, setUserDailySchedules] = useState({}) // Store schedules by user and date
    const [validationResult, setValidationResult] = useState(null)
    const [endsNextDay, setEndsNextDay] = useState(false) // Overnight flag

    // Statistics state
    const [weeklyStats, setWeeklyStats] = useState({})

    const shiftTypes = [
        { value: 'regular', label: 'Regular Shift', color: '#2563eb' },
        { value: 'overtime', label: 'Overtime', color: '#ef4444' },
        { value: 'break', label: 'Break Time', color: '#f59e0b' },
        { value: 'meeting', label: 'Meeting/Training', color: '#8b5cf6' }
    ];

    const timeSlots = useMemo(() => {
        const slots = [];
        for (let hour = 0; hour < 24; hour++) {
            const h = hour.toString().padStart(2, '0');
            slots.push(`${h}:00`);
            slots.push(`${h}:15`);
            slots.push(`${h}:30`);
            slots.push(`${h}:45`);
        }
        return slots;
    }, []);


    useEffect(() => {
        const refColUsers = collection(dbFirestore, 'users')
        const queryUsers = query(refColUsers, orderBy('lastName'))

        const unsubscribe = onSnapshot(queryUsers, async (onSnap) => {
            const data = onSnap.docs.map((docRef) => ({ id: docRef.id, ...docRef.data() }))
            setColUsersData(data)
            setLoading(false)
            
            // Load all schedules for calendar view and kick off live syncing logic
            await loadAllSchedules(data);
        }, (error) => {
            toast.error(`Error fetching users: ${error.message}`, { position: 'top-right' });
            setLoading(false)
        })
        return () => unsubscribe()
    }, [])

    // Real-time validation when form fields change
    useEffect(() => {
        if (eventDate && startHour && endHour && selectedUserId) {
            const userDailyData = userDailySchedules[selectedUserId];
            const existingShiftsForDate = userDailyData && userDailyData[eventDate] 
                ? userDailyData[eventDate].shifts 
                : [];

            const validation = validateShiftOverlap(
                startHour, 
                endHour, 
                eventDate, 
                existingShiftsForDate,
                null,
                { allowOvernight: endsNextDay, maxHours: 16 }
            );

            setValidationResult(validation);
        } else {
            setValidationResult(null);
        }
    }, [eventDate, startHour, endHour, selectedUserId, userDailySchedules, endsNextDay])

    const loadAllSchedules = async (users) => {
        const stats = {};

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
                    setUserDailySchedules(prev => ({
                        ...prev,
                        [user.id]: userDailyGroup
                    }));

                    // Calculate weekly stats for dashboard cards (visual only)
                    const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
                    const currentWeekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
                    
                    const weeklyHours = userEvents
                        .filter(event => 
                            event.start >= currentWeekStart && 
                            event.start <= currentWeekEnd
                        )
                        .reduce((total, event) => {
                            const hours = differenceInHours(event.end, event.start);
                            return total + hours;
                        }, 0);

                    stats[user.id] = {
                        weeklyHours,
                        totalShifts: userEvents.length,
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

    const validateScheduleForm = () => {
        if (!eventDate || !startHour || !endHour || !eventDescription.trim()) {
            toast.error('Please fill in all required fields', { position: 'top-right' });
            setValidationResult(null);
            return false;
        }

        const start = new Date(`${eventDate}T${startHour}`);
        let end = new Date(`${eventDate}T${endHour}`);
        if (endsNextDay || end <= start) {
            if (endsNextDay) {
                if (end <= start) {
                    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
                }
            } else if (end <= start) {
                toast.error('End time must be after start time (or select Ends Next Day)', { position: 'top-right' });
                setValidationResult(null);
                return false;
            }
        }

        const duration = differenceInHours(end, start);
        if (duration > 16) {
            toast.error('A shift cannot last more than 16 hours', { position: 'top-right' });
            setValidationResult(null);
            return false;
        }

        const userDailyData = userDailySchedules[selectedUserId];
        const existingShiftsForDate = userDailyData && userDailyData[eventDate] 
            ? userDailyData[eventDate].shifts 
            : [];

        const validation = validateShiftOverlap(
            startHour, 
            endHour, 
            eventDate, 
            existingShiftsForDate,
            null,
            { allowOvernight: endsNextDay, maxHours: 16 }
        );

        setValidationResult(validation);

        if (!validation.isValid) {
            toast.error(validation.message, { position: 'top-right', autoClose: 5000 });
            return false;
        }

        if (existingShiftsForDate.length > 0) {
            toast.success(
                `✅ Valid shift. Total daily hours (start date): ${validation.totalDailyHours}h`, 
                { position: 'top-right', autoClose: 3000 }
            );
        }

        return true;
    };

    function makeSchdFormVisible(userId, userName) {
        setSelectedUserId(userId)
        setSelectedUserName(userName)
        setVisibilitySchdForm(true)
        
        if (!eventDate) {
            setEventDate(format(new Date(), 'yyyy-MM-dd'));
        }
    }

    function hideSchdForm() {
        setVisibilitySchdForm(false)
        setSelectedUserId('')
        setSelectedUserName('')
        setEventDate('')
        setStartHour('')
        setEndHour('')
        setEventDescription('')
        setIsSubmitting(false)
        setValidationResult(null)
        setEndsNextDay(false)
    }

    async function addSchedule(e) {
        e.preventDefault()

        if (!validateScheduleForm()) {
            return;
        }

        setIsSubmitting(true);

        try {
            const start = new Date(`${eventDate}T${startHour}`);
            let end = new Date(`${eventDate}T${endHour}`);
            let effectiveEnd = end;
            if (endsNextDay || end <= start) {
                if (endsNextDay && end <= start) {
                    effectiveEnd = new Date(end.getTime() + 24 * 60 * 60 * 1000);
                } else if (!endsNextDay && end <= start) {
                    throw new Error('Invalid end time without overnight flag');
                }
            }
            const duration = differenceInHours(effectiveEnd, start);
            const isWeekendShift = isWeekend(start);

            const endDate = (endsNextDay && effectiveEnd.getDate() !== start.getDate())
                ? format(addDays(new Date(eventDate), 1), 'yyyy-MM-dd')
                : eventDate;

            const documentData = {
                eventDate: eventDate,
                endDate: endDate,
                eventDescription: eventDescription.trim(),
                startHour: startHour,
                endHour: endHour,
                duration: duration,
                isWeekend: isWeekendShift,
                shiftType: isWeekendShift ? 'overtime' : 'regular',
                overnight: endsNextDay || (endDate !== eventDate),
                checkedInTime: '',
                checkedOutTime: '',
                totalHoursDay: 0,
                createdAt: Timestamp.now(),
                status: 'scheduled'
            }

            await AddSchdForADateInFirestore(selectedUserId, documentData);
            hideSchdForm();
            
        } catch (error) {
            console.error('Error adding schedule:', error);
            toast.error('Failed to create schedule', { position: 'top-right' });
        } finally {
            setIsSubmitting(false);
        }
    }

    function AddSchdForADateInFirestore(userId, documentData) {
        const userDocRef = doc(dbFirestore, 'users', userId)
        const userSubColSchdRef = collection(userDocRef, 'UserSchedule')

        return addDoc(userSubColSchdRef, documentData)
            .then((docRef) => {
                toast.success(`✅ Schedule created successfully!`, {
                    position: 'top-right',
                    autoClose: 2000
                });
                return docRef.id;
            })
            .catch((error) => {
                toast.error(`❌ Error creating schedule: ${error.message}`, {
                    position: 'top-right'
                });
                throw error;
            });
    }

    function navigateScheduleUser(user) {
        navigate('/userschedule', { 
            state: { 
                userId: user.id,
                userName: `${user.firstName} ${user.lastName}`,
                userCategory: user.category
            } 
        })
    }

    const handleSelectEvent = (event) => {
        const user = colUsersData.find(u => u.id === event.userId);
        if (user) {
            navigateScheduleUser(user);
        }
    };

    const handleSelectSlot = ({ start }) => {
        if (selectedUser) {
            const dateStr = format(start, 'yyyy-MM-dd');
            const timeStr = format(start, 'HH:mm');
            
            setEventDate(dateStr);
            setStartHour(timeStr);
            setEndHour(format(addHours(start, 4), 'HH:mm')); // Default 4-hour shift
            makeSchdFormVisible(selectedUser.id, `${selectedUser.firstName} ${selectedUser.lastName}`);
        } else {
            toast.info('Please select a user first to create a schedule', { position: 'top-right' });
        }
    };

    const eventStyleGetter = (event) => {
        const shiftType = event.resource?.shiftType || 'regular';
        const shiftConfig = shiftTypes.find(type => type.value === shiftType);
        
        return {
            style: {
                backgroundColor: shiftConfig?.color || '#2563eb',
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
                Loading employees and schedules...
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            {/* View Toggle */}
            <div className="card mb-4">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="card-title">📋 Schedule Management</h1>
                        <p className="card-subtitle">Manage employee schedules and time tracking</p>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setCurrentView('lista')}
                            className={`btn ${currentView === 'lista' ? 'btn-primary' : 'btn-secondary'}`}
                        >
                            📋 List View
                        </button>
                        <button 
                            onClick={() => setCurrentView('calendario')}
                            className={`btn ${currentView === 'calendario' ? 'btn-primary' : 'btn-secondary'}`}
                        >
                            📅 Calendar View
                        </button>
                    </div>
                </div>
            </div>

            {/* Statistics Cards */}
            {Object.keys(weeklyStats).length > 0 && (
                <div className="stats-grid mb-6">
                    <div className="stat-card">
                        <div className="stat-value">
                            {colUsersData.length}
                        </div>
                        <div className="stat-label">Total Employees</div>
                    </div>
                    <div className="stat-card success">
                        <div className="stat-value">
                            {Object.values(weeklyStats).reduce((sum, stat) => sum + stat.totalShifts, 0)}
                        </div>
                        <div className="stat-label">Total Shifts</div>
                    </div>
                    <div className="stat-card warning">
                        <div className="stat-value">
                            {Object.values(weeklyStats).reduce((sum, stat) => sum + stat.weeklyHours, 0)}
                        </div>
                        <div className="stat-label">Weekly Hours</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">
                            {Object.values(weeklyStats).reduce((sum, stat) => sum + stat.upcomingShifts, 0)}
                        </div>
                        <div className="stat-label">Upcoming Shifts</div>
                    </div>
                </div>
            )}

            {currentView === 'calendario' && (
                <div className="animate-slide-in">
                    {/* Calendar Legend */}
                    <div className="calendar-legend mb-4">
                        <h3 className="legend-title">Shift Types</h3>
                        <div className="legend-items">
                            {shiftTypes.map(type => (
                                <div key={type.value} className="legend-item">
                                    <div 
                                        className="legend-color"
                                        style={{ backgroundColor: type.color }}
                                    ></div>
                                    <span>{type.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* User Selection for Calendar */}
                    <div className="card mb-4">
                        <div className="form-group">
                            <label className="form-label">
                                Select User for Quick Schedule Creation
                            </label>
                            <select 
                                value={selectedUser?.id || ''}
                                onChange={(e) => {
                                    const user = colUsersData.find(u => u.id === e.target.value);
                                    setSelectedUser(user || null);
                                }}
                                className="form-select"
                            >
                                <option value="">Click on the calendar to create a schedule for...</option>
                                {colUsersData.map((user) => (
                                    <option key={user.id} value={user.id}>
                                        {user.firstName} {user.lastName} ({user.category})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Calendar Component */}
                    <div className="card">
                        <Calendar
                            localizer={localizer}
                            events={calendarEvents}
                            startAccessor="start"
                            endAccessor="end"
                            style={{ height: 600 }}
                            onSelectEvent={handleSelectEvent}
                            onSelectSlot={handleSelectSlot}
                            selectable
                            eventPropGetter={eventStyleGetter}
                            views={['month', 'week', 'day', 'agenda']}
                            defaultView="week"
                            step={15}
                            timeslots={4}
                            min={new Date(0, 0, 0, 0, 0, 0)}      // 00:00
                            max={new Date(0, 0, 0, 23, 59, 0)}    // 23:59
                            formats={{
                                timeGutterFormat: 'HH:mm',
                                eventTimeRangeFormat: ({ start, end }) =>
                                    `${format(start, 'HH:mm')} - ${format(end, 'HH:mm')}`
                            }}
                        />

                    </div>
                </div>
            )}

            {currentView === 'lista' && (
                <div className="animate-slide-in">
                    {/* Users List */}
                    <div className="card">
                        <div className="card-header">
                            <h2 className="card-title">Employee List</h2>
                            <p className="card-subtitle">
                                Create schedules and manage employee time tracking
                            </p>
                        </div>
                        
                        {colUsersData.length === 0 ? (
                            <div className="text-center py-8">
                                <p className="text-gray-500 mb-4">No employees found</p>
                                <button 
                                    onClick={() => navigate('/')}
                                    className="btn btn-primary"
                                >
                                    👥 Create First Employee
                                </button>
                            </div>
                        ) : (
                            <div className="table-container">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Employee</th>
                                            <th>Category</th>
                                            <th>Hourly Wage</th>
                                            <th>Weekly Hours</th>
                                            <th>Total Shifts</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {colUsersData.map((user) => {
                                            const stats = weeklyStats[user.id] || { weeklyHours: 0, totalShifts: 0, upcomingShifts: 0 };
                                            const dailyData = userDailySchedules[user.id] || {};
                                            const totalDays = Object.keys(dailyData).length;
                                            const todayDate = format(new Date(), 'yyyy-MM-dd');
                                            const todayShifts = dailyData[todayDate] ? dailyData[todayDate].shifts.length : 0;
                                            
                                            return (
                                                <tr key={user.id}>
                                                    <td>
                                                        <div>
                                                            <div className="font-semibold">
                                                                {user.firstName} {user.lastName}
                                                            </div>
                                                            <div className="text-sm text-gray-500">
                                                                ID: {user.id.slice(-8)}
                                                            </div>
                                                            {todayShifts > 0 && (
                                                                <div className="text-xs text-blue-600 mt-1">
                                                                    📅 {todayShifts} shift{todayShifts > 1 ? 's' : ''} today
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                                                            {user.category}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className="font-semibold text-green-600">
                                                            CAD ${user.hourlyWage}/hr
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div className="flex items-center gap-2">
                                                            <span>{stats.weeklyHours}h</span>
                                                            {stats.weeklyHours > 40 && (
                                                                <span className="text-orange-500 text-sm" title="Overtime hours">⚠️</span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            in {totalDays} day{totalDays !== 1 ? 's' : ''}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="text-center">
                                                            <div className="font-semibold">{stats.totalShifts}</div>
                                                            <div className="text-xs text-gray-500">
                                                                {stats.upcomingShifts} upcoming
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => makeSchdFormVisible(user.id, `${user.firstName} ${user.lastName}`)}
                                                                className="btn btn-success btn-sm"
                                                                title="Create New Shift"
                                                            >
                                                                ➕ Shift
                                                            </button>
                                                            <button
                                                                onClick={() => navigateScheduleUser(user)}
                                                                className="btn btn-primary btn-sm"
                                                                title="View User Schedule"
                                                            >
                                                                👁️ View
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="mt-6">
                            <button 
                                onClick={() => navigate('/')} 
                                className="btn btn-secondary"
                            >
                                ← Back to Create User
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Schedule Creation Modal */}
            {visibilitySchdForm && (
                <div className="modal-overlay">
                    <div className="modal event-modal">
                        <div className="modal-header">
                            <div>
                                <h2 className="modal-title">
                                    📅 Create Schedule for {selectedUserName}
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Schedule a new work shift or appointment
                                </p>
                            </div>
                            <button 
                                onClick={hideSchdForm}
                                className="modal-close"
                                disabled={isSubmitting}
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={addSchedule} className="space-y-4">
                            <div className="form-group">
                                <label className="form-label">
                                    📅 Event Date *
                                </label>
                                <input
                                    type='date'
                                    value={eventDate}
                                    onChange={(e) => setEventDate(e.target.value)}
                                    className="form-input"
                                    required
                                    disabled={isSubmitting}
                                    min={format(new Date(), 'yyyy-MM-dd')}
                                />
                            </div>

                            <div className="flex gap-4">
                                <div className="form-group flex-1">
                                    <label className="form-label">
                                        🕐 Start Time *
                                    </label>
                                    <select
                                        value={startHour}
                                        onChange={(e) => setStartHour(e.target.value)}
                                        className="form-select"
                                        required
                                        disabled={isSubmitting}
                                    >
                                        <option value="">Select start time</option>
                                        {timeSlots.map(time => (
                                            <option key={time} value={time}>{time}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group flex-1">
                                    <label className="form-label">
                                        🕐 End Time *
                                    </label>
                                    <select
                                        value={endHour}
                                        onChange={(e) => setEndHour(e.target.value)}
                                        className="form-select"
                                        required
                                        disabled={isSubmitting}
                                    >
                                        <option value="">Select end time</option>
                                        {timeSlots.map(time => (
                                            <option key={time} value={time}>{time}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="form-group flex items-center gap-2">
                                <input
                                    id="endsNextDay"
                                    type="checkbox"
                                    className="form-checkbox"
                                    checked={endsNextDay}
                                    onChange={(e) => setEndsNextDay(e.target.checked)}
                                    disabled={isSubmitting}
                                />
                                <label htmlFor="endsNextDay" className="form-label !mb-0">
                                    🌙 Ends Next Day (Overnight Shift)
                                </label>
                            </div>

                            {startHour && endHour && eventDate && (
                                <div className={`p-3 rounded ${
                                    validationResult?.isValid === false 
                                        ? 'bg-red-50 border border-red-200' 
                                        : validationResult?.isValid === true 
                                            ? 'bg-green-50 border border-green-200'
                                            : 'bg-blue-50'
                                }`}>
                                    <div className={`text-sm ${
                                        validationResult?.isValid === false 
                                            ? 'text-red-700' 
                                            : validationResult?.isValid === true 
                                                ? 'text-green-700'
                                                : 'text-blue-700'
                                    }`}>
                                        {(() => {
                                            try {
                                                const baseDate = '2000-01-01';
                                                const start = new Date(`${baseDate}T${startHour}`);
                                                let end = new Date(`${baseDate}T${endHour}`);
                                                if ((endsNextDay || end <= start) && endHour && startHour) {
                                                    if (endsNextDay && end <= start) {
                                                        end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
                                                    }
                                                }
                                                const duration = differenceInHours(end, start);
                                                
                                                const userDailyData = userDailySchedules[selectedUserId];
                                                const existingShiftsForDate = userDailyData && userDailyData[eventDate] 
                                                    ? userDailyData[eventDate].shifts 
                                                    : [];

                                                return (
                                                    <div>
                                                        <div className="font-medium mb-2">
                                                            📊 Shift Information
                                                        </div>
                                                        <div className="space-y-1">
                                                            <div>⏱️ Duration: {duration} hour{duration !== 1 ? 's' : ''} {validationResult?.overnight && ' (overnight)'} </div>
                                                            <div>📅 Existing shifts this day: {existingShiftsForDate.length}</div>
                                                            {validationResult && (
                                                                <div className="mt-2 p-2 rounded bg-white">
                                                                    <div className={`text-sm font-medium ${
                                                                        validationResult.isValid ? 'text-green-800' : 'text-red-800'
                                                                    }`}>
                                                                        {validationResult.isValid ? '✅' : '❌'} {validationResult.message}
                                                                    </div>
                                                                    {validationResult.isValid && validationResult.totalDailyHours && (
                                                                        <div className="text-xs text-gray-600 mt-1">
                                                                            Total daily hours: {validationResult.totalDailyHours}h
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                        {eventDate && isWeekend(new Date(eventDate)) && (
                                                            <div className="mt-2 text-orange-600">
                                                                🎯 Weekend - Overtime rate
                                                            </div>
                                                        )}
                                                        {validationResult?.overnight && (
                                                            <div className="mt-2 text-indigo-600">
                                                                🌙 Overnight shift spanning {eventDate} → {format(addDays(new Date(eventDate),1), 'yyyy-MM-dd')}
                                                            </div>
                                                        )}
                                                        {existingShiftsForDate.length > 0 && (
                                                            <div className="mt-2">
                                                                <div className="text-xs font-medium text-gray-700 mb-1">
                                                                    Existing shifts for {format(new Date(eventDate), 'MM/dd/yyyy')}:
                                                                </div>
                                                                {existingShiftsForDate.map((shift, index) => (
                                                                    <div key={shift.id || index} className="text-xs text-gray-600">
                                                                        • {shift.startHour} - {shift.endHour}: {shift.eventDescription}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            } catch {
                                                return 'Error calculating duration';
                                            }
                                        })()}
                                    </div>
                                </div>
                            )}

                            <div className="form-group">
                                <label className="form-label">
                                    📝 Event Description *
                                </label>
                                <textarea
                                    value={eventDescription}
                                    onChange={(e) => setEventDescription(e.target.value)}
                                    className="form-textarea"
                                    rows={3}
                                    required
                                    disabled={isSubmitting}
                                    placeholder="Describe the work shift or activity..."
                                />
                            </div>

                            <div className="flex gap-4 pt-4 border-t">
                                <button 
                                    type='submit'
                                    className={`btn flex-1 ${
                                        validationResult?.isValid === false 
                                            ? 'btn-danger' 
                                            : validationResult?.isValid === true
                                                ? 'btn-success'
                                                : 'btn-primary'
                                    }`}
                                    disabled={isSubmitting || (validationResult && !validationResult.isValid)}
                                >
                                    {isSubmitting ? (
                                        <>
                                            <span className="spinner"></span>
                                            Creating...
                                        </>
                                    ) : validationResult?.isValid === false ? (
                                        <>
                                            ❌ Schedule Conflict
                                        </>
                                    ) : validationResult?.isValid === true ? (
                                        <>
                                            ✅ Create Shift
                                        </>
                                    ) : (
                                        <>
                                            💾 Create Shift
                                        </>
                                    )}
                                </button>
                                <button 
                                    type="button"
                                    onClick={hideSchdForm}
                                    className="btn btn-secondary"
                                    disabled={isSubmitting}
                                >
                                    ❌ Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

export default AddSchedule;
