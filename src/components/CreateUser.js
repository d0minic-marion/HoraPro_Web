

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { dbFirestore, authFirebase } from '../connections/ConnFirebaseServices';

import './CreateUser.css'

import {
    collection,
    doc,
    getDoc,
    setDoc,
    addDoc, // kept in case you still rely on it somewhere else in this file (backward-compat safety)
    serverTimestamp,
    orderBy,
    query,
} from 'firebase/firestore';

import { createUserWithEmailAndPassword } from 'firebase/auth';

import { toast } from 'react-toastify';

/**
 * NOTE ABOUT ARCHITECTURE
 * -----------------------
 * We now create the Authentication account first (email + temp password),
 * then we grab authUser.uid and use that UID as the Firestore document ID
 * in `users/{uid}`.
 *
 * This guarantees:
 *   - The user will later be able to log in (in the other app) using email/password.
 *   - We can securely load that user's data by their uid.
 *   - Subcollections like `users/{uid}/UserSchedule` keep working with uid as the key.
 *
 * We keep overtime settings, styling, navigation, and everything else intact.
 */

// We keep/extend the job category list that was already in the code.
const jobCategories = [
    'Full-Time Employee',
    'Part-Time Employee',
    'Contractor',
    'Intern',
    'Manager / Supervisor',
];

function CreateUser() {
    const navigate = useNavigate();

    // -----------------------------
    // STATE: Create User form fields
    // -----------------------------
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [category, setCategory] = useState('');
    const [hourlyWage, setHourlyWage] = useState('');

    // NEW FIELDS for Auth creation
    const [email, setEmail] = useState('');
    const [tempPassword, setTempPassword] = useState('');

    // form / UI control
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState({});

    // -------------------------------------------------
    // STATE: Global Overtime Rules (already in the app)
    // -------------------------------------------------
    const [otThreshold, setOtThreshold] = useState('40');  // weekly regular hours before overtime
    const [otPercent, setOtPercent] = useState('50');      // how much % increase for overtime
    const [otUpdatedAt, setOtUpdatedAt] = useState(null);
    const [otSaving, setOtSaving] = useState(false);
    const [otLoading, setOtLoading] = useState(true);

    // --------------------------------
    // Load overtime rules on mount
    // --------------------------------
    useEffect(() => {
        async function loadOvertime() {
            try {
                const ref = doc(dbFirestore, 'SystemSettings', 'OvertimeRules');
                const snap = await getDoc(ref);

                if (snap.exists()) {
                    const data = snap.data();

                    // Fallback defaults
                    const th = parseFloat(data.thresholdHours) || 40;
                    const pct = parseFloat(data.overtimePercent) || 50;

                    setOtThreshold(String(th));
                    setOtPercent(String(pct));

                    if (data.updatedAt?.toDate) {
                        setOtUpdatedAt(data.updatedAt.toDate());
                    }
                } else {
                    // Initialize defaults in Firestore if not present
                    await setDoc(
                        ref,
                        {
                            thresholdHours: 40,
                            overtimePercent: 50,
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                        },
                        { merge: true }
                    );

                    setOtThreshold('40');
                    setOtPercent('50');
                }
            } catch (e) {
                console.error('Error loading overtime settings', e);
                toast.error('Error loading overtime settings');
            } finally {
                setOtLoading(false);
            }
        }

        loadOvertime();
    }, []);

    // -------------------------------------------------
    // Save overtime rule updates (unchanged behavior)
    // -------------------------------------------------
    const saveOvertime = async (e) => {
        e.preventDefault();

        // basic validation
        const thresholdNum = parseFloat(otThreshold);
        const percentNum = parseFloat(otPercent);

        if (isNaN(thresholdNum) || thresholdNum <= 0) {
            toast.error('Please provide a valid Weekly Regular Hours Threshold');
            return;
        }
        if (isNaN(percentNum) || percentNum < 0) {
            toast.error('Please provide a valid Overtime Increase (%)');
            return;
        }

        setOtSaving(true);
        try {
            const ref = doc(dbFirestore, 'SystemSettings', 'OvertimeRules');
            await setDoc(
                ref,
                {
                    thresholdHours: thresholdNum,
                    overtimePercent: percentNum,
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );

            toast.success('Overtime settings saved');
        } catch (e) {
            console.error(e);
            toast.error('Failed to save overtime settings');
        } finally {
            setOtSaving(false);
        }
    };

    // ----------------------------------------
    // Validate Create-User form before submit
    // ----------------------------------------
    const validateForm = () => {
        const newErrors = {};

        // First name
        if (!firstName.trim()) {
            newErrors.firstName = 'First name is required';
        } else if (firstName.trim().length < 2) {
            newErrors.firstName = 'First name must be at least 2 characters';
        }

        // Last name
        if (!lastName.trim()) {
            newErrors.lastName = 'Last name is required';
        } else if (lastName.trim().length < 2) {
            newErrors.lastName = 'Last name must be at least 2 characters';
        }

        // Category
        if (!category.trim()) {
            newErrors.category = 'Please select a category';
        }

        // Hourly wage
        const wageNum = parseFloat(hourlyWage);
        if (!hourlyWage) {
            newErrors.hourlyWage = 'Hourly wage is required';
        } else if (isNaN(wageNum) || wageNum < 15.75) {
            // NOTE: in your code you were enforcing min CAD wage ~15.75
            newErrors.hourlyWage = 'Hourly wage must be at least 15.75';
        }

        // Email
        if (!email.trim()) {
            newErrors.email = 'Email is required';
        } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
            newErrors.email = 'Please provide a valid email address';
        }

        // Temporary password
        if (!tempPassword.trim()) {
            newErrors.tempPassword = 'Temporary password is required';
        } else if (tempPassword.length < 6) {
            // Firebase Auth requires min 6 chars
            newErrors.tempPassword = 'Password must be at least 6 characters';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // ---------------------------
    // Reset form after submit
    // ---------------------------
    const resetForm = () => {
        setFirstName('');
        setLastName('');
        setCategory('');
        setHourlyWage('');
        setEmail('');
        setTempPassword('');
        setErrors({});
    };

    // -------------------------------------------------
    // Create user in Auth, then create Firestore doc
    // -------------------------------------------------
    const handleCreateUser = async (e) => {
        e.preventDefault();

        if (isSubmitting) return;

        // Validate front-end form first
        if (!validateForm()) {
            toast.error('Please fix the highlighted fields');
            return;
        }

        setIsSubmitting(true);

        try {
            // 1. Create Auth account using email + temporary password
            const userCredential = await createUserWithEmailAndPassword(
                authFirebase,
                email.trim(),
                tempPassword
            );

            const authUser = userCredential.user;
            const uid = authUser.uid;

            // 2. Store user profile in Firestore at `users/{uid}`
            const userDocRef = doc(dbFirestore, 'users', uid);

            await setDoc(userDocRef, {
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                category: category.trim(),
                hourlyWage: parseFloat(hourlyWage),
                email: email.trim(),
                createdAt: new Date(),
                isActive: true,
            });

            toast.success('User created successfully', {
                position: 'top-right',
            });

            resetForm();
        } catch (error) {
            console.error('Error creating user:', error);
            toast.error(`Error creating user: ${error.message}`, {
                position: 'top-right',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // ---------------------------
    // RENDER
    // ---------------------------
    return (
        <div className="animate-fade-in">
            {/* ------------------------------ */}
            {/* 1. GLOBAL OVERTIME SETTINGS    */}
            {/* ------------------------------ */}
            <div className="card">
                <div className="card-header">
                    <h1 className="card-title">Overtime Settings (Global)</h1>
                    <p className="card-subtitle">
                        These rules affect all users for weekly earnings & overtime
                        splits
                    </p>
                </div>

                <form onSubmit={saveOvertime} className="grid md:grid-cols-3 gap-4">
                    {/* Threshold hours */}
                    <div className="form-group">
                        <label className="form-label">
                            Weekly Regular Hours Threshold *
                        </label>
                        <input
                            type="number"
                            min="1"
                            step="0.25"
                            value={otThreshold}
                            onChange={(e) => setOtThreshold(e.target.value)}
                            className="form-input"
                            disabled={otSaving || otLoading}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Example: 40 means hours after 40 become overtime.
                        </p>
                    </div>

                    {/* Overtime percent */}
                    <div className="form-group">
                        <label className="form-label">Overtime Increase (%) *</label>
                        <input
                            type="number"
                            min="0"
                            step="1"
                            value={otPercent}
                            onChange={(e) => setOtPercent(e.target.value)}
                            className="form-input"
                            disabled={otSaving || otLoading}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            50 = pays 1.5x, 100 = 2x
                        </p>
                    </div>

                    {/* Last updated info */}
                    <div className="form-group">
                        <label className="form-label">Last Updated</label>
                        <div className="p-2 border rounded bg-gray-50 text-sm text-gray-700">
                            {otLoading
                                ? 'Loading...'
                                : (otUpdatedAt
                                    ? (otUpdatedAt.toDate ? otUpdatedAt.toDate().toLocaleString() : otUpdatedAt.toLocaleString())
                                    : 'No data')}
                        </div>
                    </div>

                    {/* Save button row */}
                    <div className="md:col-span-3 flex flex-wrap gap-2 mt-2">
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={otSaving || otLoading}
                        >
                            {otSaving ? 'Saving...' : 'Save Overtime Rules'}
                        </button>
                    </div>
                </form>
            </div>

            {/* ------------------------------ */}
            {/* 2. CREATE NEW USER (EMPLOYEE)  */}
            {/* ------------------------------ */}
            <div className="card mt-6">
                <div className="card-header">
                    <h2 className="card-title">Create New User / Employee</h2>
                    <p className="card-subtitle">
                        This will create a login account (email / temporary password)
                        and register this employee in the system.
                    </p>
                </div>

                <form onSubmit={handleCreateUser} className="grid md:grid-cols-2 gap-4">
                    {/* First Name */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="firstName">
                            First Name *
                        </label>
                        <input
                            id="firstName"
                            type="text"
                            className={`form-input ${errors.firstName ? 'border-danger' : ''
                                }`}
                            value={firstName}
                            disabled={isSubmitting}
                            onChange={(e) => setFirstName(e.target.value)}
                        />
                        {errors.firstName && (
                            <div className="text-danger mt-1 text-sm">
                                {errors.firstName}
                            </div>
                        )}
                    </div>

                    {/* Last Name */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="lastName">
                            Last Name *
                        </label>
                        <input
                            id="lastName"
                            type="text"
                            className={`form-input ${errors.lastName ? 'border-danger' : ''
                                }`}
                            value={lastName}
                            disabled={isSubmitting}
                            onChange={(e) => setLastName(e.target.value)}
                        />
                        {errors.lastName && (
                            <div className="text-danger mt-1 text-sm">
                                {errors.lastName}
                            </div>
                        )}
                    </div>

                    {/* Category */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="category">
                            Category / Role *
                        </label>
                        <select
                            id="category"
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className={`form-select ${errors.category ? 'border-danger' : ''
                                }`}
                            disabled={isSubmitting}
                        >
                            <option value="">Select a category</option>
                            {jobCategories.map((cat) => (
                                <option key={cat} value={cat}>
                                    {cat}
                                </option>
                            ))}
                        </select>
                        {errors.category && (
                            <div className="text-danger mt-1 text-sm">
                                {errors.category}
                            </div>
                        )}
                    </div>

                    {/* Hourly Wage */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="hourlyWage">
                            Hourly Wage (CAD) *
                        </label>
                        <input
                            id="hourlyWage"
                            type="number"
                            min={15.75}
                            max={500}
                            step={0.01}
                            className={`form-input ${errors.hourlyWage ? 'border-danger' : ''
                                }`}
                            value={hourlyWage}
                            disabled={isSubmitting}
                            onChange={(e) => setHourlyWage(e.target.value)}
                        />
                        {errors.hourlyWage && (
                            <div className="text-danger mt-1 text-sm">
                                {errors.hourlyWage}
                            </div>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                            Minimum suggested: 15.75 CAD / hour
                        </p>
                    </div>

                    {/* Email Address (NEW) */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="email">
                            Email Address *
                        </label>
                        <input
                            id="email"
                            type="email"
                            className={`form-input ${errors.email ? 'border-danger' : ''
                                }`}
                            value={email}
                            disabled={isSubmitting}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                        {errors.email && (
                            <div className="text-danger mt-1 text-sm">
                                {errors.email}
                            </div>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                            The employee will use this email to sign in (in the other
                            app).
                        </p>
                    </div>

                    {/* Temporary Password (NEW) */}
                    <div className="form-group">
                        <label className="form-label" htmlFor="tempPassword">
                            Temporary Password (for first login) *
                        </label>
                        <input
                            id="tempPassword"
                            type="password"
                            className={`form-input ${errors.tempPassword ? 'border-danger' : ''
                                }`}
                            value={tempPassword}
                            disabled={isSubmitting}
                            onChange={(e) => setTempPassword(e.target.value)}
                        />
                        {errors.tempPassword && (
                            <div className="text-danger mt-1 text-sm">
                                {errors.tempPassword}
                            </div>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                            Minimum 6 characters. The employee can change it later.
                        </p>
                    </div>

                    {/* ACTION BUTTONS */}
                    <div className="md:col-span-2 flex flex-wrap gap-2 mt-4">
                        <button
                            type="submit"
                            className="btn btn-primary flex-1"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Creating...' : 'Create User'}
                        </button>

                        <button
                            type="button"
                            onClick={resetForm}
                            className="btn btn-secondary flex-none"
                            disabled={isSubmitting}
                        >
                            Clear Form
                        </button>

                        <button
                            type="button"
                            onClick={() => navigate('/schedulizer')}
                            className="btn btn-success flex-1"
                            disabled={isSubmitting}
                        >
                            View All Employees & Schedules
                        </button>
                    </div>
                </form>
            </div>

            {/* (No info card removed / no other UI removed) */}
        </div>
    );
}

export default CreateUser;

