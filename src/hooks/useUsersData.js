import { useState, useEffect } from 'react';
import { dbFirestore } from '../connections/ConnFirebaseServices';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { toast } from 'react-toastify';

/**
 * Custom hook to load and manage users data with real-time synchronization
 * @returns {Object} - { colUsersData, loading }
 */
function useUsersData() {
    const [colUsersData, setColUsersData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const refColUsers = collection(dbFirestore, 'users');
        const queryUsers = query(refColUsers, orderBy('lastName'));

        const unsubscribe = onSnapshot(queryUsers, (onSnap) => {
            const data = onSnap.docs.map((docRef) => ({ id: docRef.id, ...docRef.data() }));
            setColUsersData(data);
            setLoading(false);
        }, (error) => {
            toast.error(`Error fetching users: ${error.message}`, { position: 'top-right' });
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return { colUsersData, loading };
}

export default useUsersData;
