import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { dbFirestore, authFirebase } from '../connections/ConnFirebaseServices';

import {
  doc,
  setDoc,
} from 'firebase/firestore';

import { createUserWithEmailAndPassword } from 'firebase/auth';
import { toast } from 'react-toastify';

// Centralized category options (matches existing behavior)
const jobCategories = [
  'Full-Time Employee',
  'Part-Time Employee',
  'Contractor',
  'Intern',
  'Manager / Supervisor',
];

function CreateEmployeeForm() {
  const navigate = useNavigate();

  // --- Form state ---
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [category, setCategory]   = useState('');
  const [hourlyWage, setHourlyWage] = useState('');

  // NEW Auth-related fields
  const [email, setEmail] = useState('');
  const [tempPassword, setTempPassword] = useState('');

  // Control state
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Validation ---
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
      newErrors.hourlyWage = 'Hourly wage must be at least 15.75';
    }

    // Email
    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      newErrors.email = 'Please provide a valid email address';
    }

    // Temp password
    if (!tempPassword.trim()) {
      newErrors.tempPassword = 'Temporary password is required';
    } else if (tempPassword.length < 6) {
      newErrors.tempPassword = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --- Reset form ---
  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setCategory('');
    setHourlyWage('');
    setEmail('');
    setTempPassword('');
    setErrors({});
  };

  // --- Handle submit ---
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Validate inputs first
    if (!validateForm()) {
      toast.error('Please fix the highlighted fields');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Create Authentication account
      const userCredential = await createUserWithEmailAndPassword(
        authFirebase,
        email.trim(),
        tempPassword
      );
      const authUser = userCredential.user;
      const uid = authUser.uid;

      // 2. Store employee profile in Firestore at users/{uid}
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

      toast.success(' User created successfully', {
        position: 'top-right',
      });

      resetForm();
    } catch (error) {
      console.error('Error creating user:', error);
      toast.error(` Error creating user: ${error.message}`, {
        position: 'top-right',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- RENDER FORM ---
  return (
    <div className="card mt-6">
      <div className="card-header">
        <h2 className="card-title"> Create New User / Employee</h2>
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
            className={`form-input ${errors.firstName ? 'border-danger' : ''}`}
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
            className={`form-input ${errors.lastName ? 'border-danger' : ''}`}
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
            className={`form-select ${errors.category ? 'border-danger' : ''}`}
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
            min={16.10}
            max={500}
            step={0.01}
            className={`form-input ${errors.hourlyWage ? 'border-danger' : ''}`}
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
            Minimum suggested: 16.10 CAD / hour
          </p>
        </div>

        {/* Email Address */}
        <div className="form-group">
          <label className="form-label" htmlFor="email">
            Email Address *
          </label>
          <input
            id="email"
            type="email"
            className={`form-input ${errors.email ? 'border-danger' : ''}`}
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
            The employee will use this email to sign in (in the other app).
          </p>
        </div>

        {/* Temporary Password */}
        <div className="form-group">
          <label className="form-label" htmlFor="tempPassword">
            Temporary Password (for first login) *
          </label>
          <input
            id="tempPassword"
            type="password"
            className={`form-input ${errors.tempPassword ? 'border-danger' : ''}`}
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

        {/* Action buttons */}
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
  );
}

export default CreateEmployeeForm;
