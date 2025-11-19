import { useState, useEffect } from 'react';
import { dbFirestore } from '../connections/ConnFirebaseServices';
import { doc, getDoc } from 'firebase/firestore';
import { toast } from 'react-toastify';

/**
 * Custom hook to load user profile data from Firestore
 * @param {string} userId - User ID to load
 * @param {function} navigate - Navigation function
 * @param {string} backTo - Path to navigate back on error
 * @returns {Object} - { loading, origUser, firstName, setFirstName, lastName, setLastName, category, setCategory, hourlyWage, setHourlyWage, email, setEmail, isActive, setIsActive }
 */
function useProfileLoader(userId, navigate, backTo) {
    const [loading, setLoading] = useState(true);
    const [origUser, setOrigUser] = useState(null);
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [category, setCategory] = useState('');
    const [hourlyWage, setHourlyWage] = useState('');
    const [email, setEmail] = useState('');
    const [isActive, setIsActive] = useState(true);

    useEffect(() => {
        let mounted = true;
        async function loadUser() {
            try {
                if (!userId) {
                    toast.error('Missing userId');
                    navigate(backTo);
                    return;
                }
                const ref = doc(dbFirestore, 'users', userId);
                const snap = await getDoc(ref);
                if (!snap.exists()) {
                    toast.error('User not found');
                    navigate(backTo);
                    return;
                }
                const data = snap.data();
                if (!mounted) return;
                setOrigUser(data);
                setFirstName(data.firstName || '');
                setLastName(data.lastName || '');
                setCategory(data.category || '');
                setHourlyWage(
                    typeof data.hourlyWage === 'number' && !Number.isNaN(data.hourlyWage)
                        ? String(data.hourlyWage)
                        : ''
                );
                setEmail(data.email || '');
                setIsActive(Boolean(data.isActive));
            } catch (e) {
                console.error(e);
                toast.error('Failed to load user');
                navigate(backTo);
            } finally {
                if (mounted) setLoading(false);
            }
        }
        loadUser();
        return () => {
            mounted = false;
        };
    }, [userId, navigate, backTo]);

    return {
        loading,
        origUser,
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
        isActive,
        setIsActive
    };
}

export default useProfileLoader;
