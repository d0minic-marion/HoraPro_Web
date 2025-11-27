import { useState } from 'react';
import { authFirebase } from '../connections/ConnFirebaseServices';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { toast } from 'react-toastify';

/**
 * Custom hook for user creation logic
 * Handles form state, validation, and Firebase Auth + Firestore creation
 * @returns {Object} - Form state, handlers, and submit function
 */
function useUserCreation() {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [category, setCategory] = useState('');
    const [hourlyWage, setHourlyWage] = useState('');
    const [email, setEmail] = useState('');
    const [tempPassword, setTempPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState({});

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

        // Temporary password
        if (!tempPassword.trim()) {
            newErrors.tempPassword = 'Temporary password is required';
        } else if (tempPassword.length < 6) {
            newErrors.tempPassword = 'Password must be at least 6 characters';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const resetForm = () => {
        setFirstName('');
        setLastName('');
        setCategory('');
        setHourlyWage('');
        setEmail('');
        setTempPassword('');
        setErrors({});
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();

        if (isSubmitting) return;

        if (!validateForm()) {
            toast.error('Please fix the highlighted fields');
            return;
        }

        setIsSubmitting(true);

        try {
            // Use Cloud Function to create employee (doesn't affect admin session)
            const functions = getFunctions();
            const createEmployee = httpsCallable(functions, 'createEmployee');

            const result = await createEmployee({
                email: email.trim(),
                password: tempPassword,
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                category: category.trim(),
                hourlyWage: parseFloat(hourlyWage)
            });

            console.log('Employee created:', result.data);

            toast.success('User created successfully', {
                position: 'top-right',
            });

            resetForm();
        } catch (error) {
            console.error('Error creating user:', error);
            
            const errorMessage = error.message || 'Unknown error occurred';
            
            toast.error(`Error creating user: ${errorMessage}`, {
                position: 'top-right',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return {
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
    };
}

export default useUserCreation;
