
import { useState, useEffect, useMemo } from 'react';
import { dbFirestore } from '../connections/ConnFirebaseServices'
import { 
    collection,
    addDoc,
    doc,
    setDoc,
    Timestamp
} from 'firebase/firestore';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import { 
    format, 
    isWeekend,
    differenceInMinutes,
    addHours,
    addDays
} from 'date-fns';
import { 
    parseDate,
    parseDateTime
} from '../utils/scheduleUtils';
import useUsersData from '../hooks/useUsersData';
import useAllSchedules from '../hooks/useAllSchedules';
import useScheduleValidation from '../hooks/useScheduleValidation';

const localizer = momentLocalizer(moment);


/* -----------------------------------------------------------
   REACT COMPONENT
----------------------------------------------------------- */

function AddSchedule() {
    const navigate = useNavigate()
    const location = useLocation()

    // Use custom hooks for data loading
    const { colUsersData, loading } = useUsersData();
    const { calendarEvents, userDailySchedules, weeklyStats } = useAllSchedules(colUsersData);

    const [selectedUser, setSelectedUser] = useState(null)
    const [currentView, setCurrentView] = useState('lista');
    const [filterField, setFilterField] = useState('both'); // first | last | both
    const [filterText, setFilterText] = useState('');

    const activeUsersCount = useMemo(
        () => colUsersData.filter(user => user.isActive !== false).length,
        [colUsersData]
    );

    // Form states
    const [eventDate, setEventDate] = useState('')
    const [startHour, setStartHour] = useState('')
    const [endHour, setEndHour] = useState('')
    const [eventDescription, setEventDescription] = useState('')
    const [selectedUserId, setSelectedUserId] = useState('')
    const [selectedUserName, setSelectedUserName] = useState('')
    const [visibilitySchdForm, setVisibilitySchdForm] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [endsNextDay, setEndsNextDay] = useState(false) // Overnight flag

    // Use custom hook for validation
    const validationResult = useScheduleValidation(
        eventDate, 
        startHour, 
        endHour, 
        selectedUserId, 
        userDailySchedules, 
        endsNextDay
    );

    // Listing filter
    const [showInactive, setShowInactive] = useState(false)

    // Persist showInactive in localStorage
    useEffect(() => {
        try {
            // URL param has priority on first load
            const params = new URLSearchParams(location.search || '');
            const q = params.get('showInactive');
            if (q === 'true' || q === '1') {
                setShowInactive(true);
                return;
            }
            const saved = localStorage.getItem('sched_showInactive');
            if (saved !== null) {
                setShowInactive(saved === 'true');
            }
        } catch {}
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        try {
            localStorage.setItem('sched_showInactive', showInactive ? 'true' : 'false');
        } catch {}
    }, [showInactive])

    // Filter helpers for Employee List
    const filteredUsers = useMemo(() => {
        const base = showInactive ? colUsersData : colUsersData.filter(u => u.isActive !== false);
        const term = filterText.trim().toLowerCase();
        if (!term) return base;
        
        const filtered = base.filter((u) => {
            const fn = (u.firstName || '').toLowerCase();
            const ln = (u.lastName || '').toLowerCase();
            if (filterField === 'first') return fn.includes(term);
            if (filterField === 'last') return ln.includes(term);
            return fn.includes(term) || ln.includes(term);
        });

        // Show warning if no matches found and return full list
        if (filtered.length === 0 && term) {
            toast.warning('No employees match the filter criteria', { 
                position: 'top-right',
                autoClose: 3000 
            });
            return base;
        }

        return filtered;
    }, [colUsersData, showInactive, filterField, filterText]);

    // Dynamic title based on filter
    const listTitle = useMemo(() => {
        const filterLabelMap = {
            first: 'First Name Filtered',
            last: 'Last Name Filtered',
            both: 'First/Last Name Filtered'
        };
        
        const term = filterText.trim().toLowerCase();
        if (!term) return 'Employee List';
        
        // Check if there are actual filtered results
        const base = showInactive ? colUsersData : colUsersData.filter(u => u.isActive !== false);
        const hasResults = base.some((u) => {
            const fn = (u.firstName || '').toLowerCase();
            const ln = (u.lastName || '').toLowerCase();
            if (filterField === 'first') return fn.includes(term);
            if (filterField === 'last') return ln.includes(term);
            return fn.includes(term) || ln.includes(term);
        });
        
        if (hasResults) {
            return `${filterLabelMap[filterField]} Employee List`;
        }
        
        return 'Employee List';
    }, [filterField, filterText, colUsersData, showInactive]);

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

    const validateScheduleForm = () => {
        if (!eventDate || !startHour || !endHour || !eventDescription.trim()) {
            toast.error('Please fill in all required fields', { position: 'top-right' });
            return false;
        }

        const start = parseDateTime(eventDate, startHour);
        let computedEnd = parseDateTime(eventDate, endHour);
        let computedEndDateStr = eventDate;
        if (endsNextDay || computedEnd <= start) {
            if (!endsNextDay && computedEnd <= start) {
                toast.error('End time must be after start time (or select Ends Next Day)', { position: 'top-right' });
                return false;
            }
            computedEndDateStr = format(addDays(parseDate(eventDate), 1), 'yyyy-MM-dd');
            computedEnd = parseDateTime(computedEndDateStr, endHour);
        }

        const duration = Number((differenceInMinutes(computedEnd, start) / 60).toFixed(2));
        if (duration > 16) {
            toast.error('A shift cannot last more than 16 hours', { position: 'top-right' });
            return false;
        }

        // Use validation result from hook
        if (!validationResult || !validationResult.isValid) {
            if (validationResult) {
                toast.error(validationResult.message, { position: 'top-right', autoClose: 5000 });
            }
            return false;
        }

        const userDailyData = userDailySchedules[selectedUserId];
        const existingShiftsForDate = userDailyData && userDailyData[eventDate]
            ? userDailyData[eventDate].shifts
            : [];

        if (existingShiftsForDate.length > 0) {
            toast.success(
                ` Valid shift. Total daily hours (start date): ${validationResult.totalDailyHours}h`, 
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
        setEndsNextDay(false)
    }

    async function addSchedule(e) {
        e.preventDefault()

        if (!validateScheduleForm()) {
            return;
        }

        setIsSubmitting(true);

        try {
            const start = parseDateTime(eventDate, startHour);
            let computedEndDateStr = eventDate;
            let end = parseDateTime(eventDate, endHour);

            if (endsNextDay || end <= start) {
                if (!endsNextDay && end <= start) {
                    throw new Error('Invalid end time without overnight flag');
                }
                computedEndDateStr = format(addDays(parseDate(eventDate), 1), 'yyyy-MM-dd');
                end = parseDateTime(computedEndDateStr, endHour);
            }

            const durationMinutes = differenceInMinutes(end, start);
            const duration = Number((durationMinutes / 60).toFixed(2));
            const isWeekendShift = isWeekend(start);

            const documentData = {
                eventDate: eventDate,
                eventDescription: eventDescription.trim(),
                startHour: startHour,
                endHour: endHour,
                duration: duration,
                isWeekend: isWeekendShift,
                shiftType: isWeekendShift ? 'overtime' : 'regular',
                overnight: endsNextDay || (computedEndDateStr !== eventDate),
                checkedInTime: '',
                checkedOutTime: '',
                totalHoursDay: null,
                createdAt: Timestamp.now(),
                status: 'scheduled'
            }
            if (endsNextDay || computedEndDateStr !== eventDate) {
                documentData.endDate = computedEndDateStr;
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
                toast.success(` Schedule created successfully!`, {
                    position: 'top-right',
                    autoClose: 2000
                });
                return docRef.id;
            })
            .catch((error) => {
                toast.error(` Error creating schedule: ${error.message}`, {
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
            if (selectedUser.isActive === false) {
                toast.error('This user is inactive. Activate the user to create new shifts.', { position: 'top-right' });
                return;
            }
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
                        <h1 className="card-title"> Schedule Management</h1>
                        <p className="card-subtitle">Manage employee schedules and time tracking</p>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setCurrentView('lista')}
                            className={`btn ${currentView === 'lista' ? 'btn-primary' : 'btn-secondary'}`}
                        >
                             List View
                        </button>
                        <button 
                            onClick={() => setCurrentView('calendario')}
                            className={`btn ${currentView === 'calendario' ? 'btn-primary' : 'btn-secondary'}`}
                        >
                             Calendar View
                        </button>
                    </div>
                </div>
            </div>

            {/* Statistics Cards */}
            {Object.keys(weeklyStats).length > 0 && (
                <div className="stats-grid mb-6">
                    <div className="stat-card">
                        <div className="stat-value">
                            {activeUsersCount}
                        </div>
                        <div className="stat-label">Total Active Employees</div>
                    </div>
                    <div className="stat-card success">
                        <div className="stat-value">
                            {Object.values(weeklyStats).reduce((sum, stat) => sum + stat.totalShifts, 0)}
                        </div>
                        <div className="stat-label">Weekly Total Shifts</div>
                    </div>
                    <div className="stat-card warning">
                        <div className="stat-value">
                            {Object.values(weeklyStats).reduce((sum, stat) => sum + stat.weeklyHours, 0)}
                        </div>
                        <div className="stat-label">Weekly Scheduled Hours</div>
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
                                    const pool = showInactive ? colUsersData : colUsersData.filter(u => u.isActive !== false);
                                    const user = pool.find(u => u.id === e.target.value);
                                    setSelectedUser(user || null);
                                }}
                                className="form-select"
                            >
                                <option value="">Click on the calendar to create a schedule for...</option>
                                {(showInactive ? colUsersData : colUsersData.filter(u => u.isActive !== false)).map((user) => (
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
                            <h2 className="card-title">{listTitle}</h2>
                            <p className="card-subtitle">
                                Create schedules and manage employee time tracking
                            </p>
                        </div>
                        
                        {(() => {
                            const usersToShow = filteredUsers;
                            return usersToShow.length === 0 ? (
                            <div className="text-center py-8">
                                <p className="text-gray-500 mb-4">No employees found</p>
                                <button 
                                    onClick={() => navigate('/')}
                                    className="btn btn-primary"
                                >
                                     Create First Employee
                                </button>
                            </div>
                        ) : (
                            <div className="table-container">
                                <div className="flex items-center justify-between mb-3 gap-3">
                                    <div className="flex items-center gap-2">
                                        <label className="text-base font-semibold">Filter employees by: </label>
                                        <select
                                            value={filterField}
                                            onChange={(e) => setFilterField(e.target.value)}
                                            className="form-select"
                                            style={{ width: '150px' }}
                                        >
                                            <option value="first">First Name</option>
                                            <option value="last">Last Name</option>
                                            <option value="both">First/Last Name</option>
                                        </select>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="Type to filter..."
                                            value={filterText}
                                            onChange={(e) => setFilterText(e.target.value)}
                                            style={{ width: '300px' }}
                                        />
                                    </div>
                                    <label className="flex items-center gap-2 text-sm text-gray-700">
                                        <input
                                            type="checkbox"
                                            className="form-checkbox"
                                            checked={showInactive}
                                            onChange={(e) => setShowInactive(e.target.checked)}
                                        />
                                        Show inactive
                                    </label>
                                </div>
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
                                        {usersToShow.map((user) => {
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
                                                                     {todayShifts} shift{todayShifts > 1 ? 's' : ''} today
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                                                            {user.category}
                                                        </span>
                                                        {user.isActive === false && (
                                                            <span className="ml-2 px-2 py-1 bg-red-100 text-red-800 rounded text-sm">Inactive</span>
                                                        )}
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
                                                                <span className="text-orange-500 text-sm" title="Overtime hours"></span>
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
                                                                disabled={user.isActive === false}
                                                            >
                                                                 Create Shift
                                                            </button>
                                                            <button
                                                                onClick={() => navigateScheduleUser(user)}
                                                                className="btn btn-primary btn-sm"
                                                                title="View User Schedule"
                                                            >
                                                             Schedule View
                                                            </button>
                                                            <button
                                                                onClick={() => navigate(`/editprofile/${user.id}`, { state: { backTo: '/schedulizer' } })}
                                                                className="btn btn-info btn-sm"
                                                                title="Edit Profile"
                                                            >
                                                                 Edit Profile
                                                            </button>
                                                            {showInactive && user.isActive === false && (
                                                                <button
                                                                    onClick={async () => {
                                                                        try {
                                                                            await setDoc(doc(dbFirestore, 'users', user.id), { isActive: true }, { merge: true });
                                                                            toast.success('Employee activated');
                                                                        } catch (e) {
                                                                            toast.error('Failed to activate employee');
                                                                        }
                                                                    }}
                                                                    className="btn btn-warning btn-sm"
                                                                    title="Activate Employee"
                                                                >
                                                                     Activate
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )
                        })()}

                        <div className="mt-6">
                            <button 
                                onClick={() => navigate('/')} 
                                className="btn btn-secondary"
                            >
                                Back to Create User
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Schedule Creation Modal */}
            {visibilitySchdForm && (
                <div className="modal-overlay" onClick={hideSchdForm}>
                    <div className="modal event-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h2 className="modal-title">
                                     Create Schedule for {selectedUserName}
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
                                
                            </button>
                        </div>

                        <form onSubmit={addSchedule} className="space-y-4">
                            <div className="form-group">
                                <label className="form-label">
                                     Event Date *
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
                                         Start Time *
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
                                         End Time *
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
                                     Ends Next Day (Overnight Shift)
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
                                                const start = parseDateTime(eventDate, startHour);
                                                let end = parseDateTime(eventDate, endHour);
                                                let effectiveEndDateStr = eventDate;
                                                if ((endsNextDay || end <= start) && endHour && startHour) {
                                                    effectiveEndDateStr = format(addDays(parseDate(eventDate), 1), 'yyyy-MM-dd');
                                                    end = parseDateTime(effectiveEndDateStr, endHour);
                                                }
                                                const duration = Number((differenceInMinutes(end, start) / 60).toFixed(2));
                                                
                                                const userDailyData = userDailySchedules[selectedUserId];
                                                const existingShiftsForDate = userDailyData && userDailyData[eventDate]
                                                    ? userDailyData[eventDate].shifts
                                                    : [];

                                                return (
                                                    <div>
                                                        <div className="font-medium mb-2">
                                                             Shift Information
                                                        </div>
                                                        <div className="space-y-1">
                                                            <div> Duration: {duration} hour{duration !== 1 ? 's' : ''} {validationResult?.overnight && ' (overnight)'} </div>
                                                            <div> Existing shifts this day: {existingShiftsForDate.length}</div>
                                                            {validationResult && (
                                                                <div className="mt-2 p-2 rounded bg-white">
                                                                    <div className={`text-sm font-medium ${
                                                                        validationResult.isValid ? 'text-green-800' : 'text-red-800'
                                                                    }`}>
                                                                        {validationResult.message}
                                                                    </div>
                                                                    {validationResult.isValid && validationResult.totalDailyHours && (
                                                                        <div className="text-xs text-gray-600 mt-1">
                                                                            Total daily hours: {validationResult.totalDailyHours}h
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                        {eventDate && isWeekend(parseDate(eventDate)) && (
                                                            <div className="mt-2 text-orange-600">
                                                                 Weekend - Overtime rate
                                                            </div>
                                                        )}
                                                        {validationResult?.overnight && (
                                                            <div className="mt-2 text-indigo-600">
                                                                 Overnight shift spanning {eventDate}  {format(addDays(parseDate(eventDate),1), 'yyyy-MM-dd')}
                                                            </div>
                                                        )}
                                                        {existingShiftsForDate.length > 0 && (
                                                            <div className="mt-2">
                                                                <div className="text-xs font-medium text-gray-700 mb-1">
                                                                    Existing shifts for {format(parseDate(eventDate), 'MM/dd/yyyy')}:
                                                                </div>
                                                                {existingShiftsForDate.map((shift, index) => (
                                                                    <div key={shift.id || index} className="text-xs text-gray-600">
                                                                         {shift.startHour} - {shift.endHour}: {shift.eventDescription}
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
                                     Event Description *
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
                                             Schedule Conflict
                                        </>
                                    ) : validationResult?.isValid === true ? (
                                        <>
                                             Create Shift
                                        </>
                                    ) : (
                                        <>
                                             Create Shift
                                        </>
                                    )}
                                </button>
                                <button 
                                    type="button"
                                    onClick={hideSchdForm}
                                    className="btn btn-secondary"
                                    disabled={isSubmitting}
                                >
                                     Cancel
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
