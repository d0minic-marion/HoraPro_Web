

import { useNavigate } from 'react-router-dom';
import './CreateUser.css'
import useOvertimeSettings from '../hooks/useOvertimeSettings';
import useUserCreation from '../hooks/useUserCreation';

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

    // Use custom hooks
    const {
        otThreshold,
        setOtThreshold,
        otPercent,
        setOtPercent,
        otUpdatedAt,
        otLoading,
        otSaving,
        saveOvertime
    } = useOvertimeSettings();

    const {
        firstName,
        setFirstName,
        lastName,
        setLastName,
        category,
        setCategory,
        hourlyWage,
        setHourlyWage,
        email,
        setEmail,
        tempPassword,
        setTempPassword,
        isSubmitting,
        errors,
        handleCreateUser,
        resetForm
    } = useUserCreation();

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

