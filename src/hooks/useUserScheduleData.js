import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { dbFirestore } from '../connections/ConnFirebaseServices';
import { toast } from 'react-toastify';
import { groupShiftsByDate } from '../utils/scheduleUtils';
import { syncShiftDerivedFieldsIfNeeded } from '../utils/shiftSyncHelpers';

/**
 * Custom hook to manage user schedule data loading and real-time sync
 * @param {string} userId - The user ID
 * @param {Function} navigate - React Router navigate function
 * @param {string} currentUserName - Current user name state
 * @param {string} currentUserCategory - Current user category state
 * @returns {Object} User data, schedule data, loading state, and setters
 */
export function useUserScheduleData(userId, navigate, currentUserName, currentUserCategory) {
    const [userData, setUserData] = useState(null);
    const [scheduleData, setScheduleData] = useState([]);
    const [groupedSchedules, setGroupedSchedules] = useState({});
    const [loading, setLoading] = useState(true);
    const [userName, setUserName] = useState(currentUserName);
    const [userCategory, setUserCategory] = useState(currentUserCategory);

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
                        setUserName(`${data.firstName} ${data.lastName}`);
                    }
                    if (!currentUserCategory) {
                        setUserCategory(data.category || '');
                    }
                }
            } catch (error) {
                console.error('Error loading user info:', error);
            }
        };
        loadUserInfo();

        const refColUsers = collection(dbFirestore, 'users', userId, "UserSchedule");
        const querySchedule = query(refColUsers, orderBy('eventDate', 'desc'));
        const unsubscribe = onSnapshot(querySchedule, (snapshot) => {
            const scheduleRegisters = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            }));
            setScheduleData(scheduleRegisters);
            const grouped = groupShiftsByDate(scheduleRegisters);
            setGroupedSchedules(grouped);
            
            // Silent reactive sync for external changes (no UI impact)
            // Ensures totalHoursDay and status stay correct if external apps modify check-in/out fields
            try {
                snapshot.docs.forEach((docSnap) => {
                    const shiftRef = doc(dbFirestore, 'users', userId, 'UserSchedule', docSnap.id);
                    const data = docSnap.data();
                    // Fire-and-forget; avoids blocking UI. Helper only writes when values differ
                    syncShiftDerivedFieldsIfNeeded(shiftRef, data).catch((err) => {
                        console.error('[AutoSync] Failed to sync derived fields', { id: docSnap.id, err });
                    });
                });
            } catch (err) {
                console.error('[AutoSync] Error preparing sync', err);
            }
            setLoading(false);
        }, (error) => {
            console.log('Error fetching schedule', error);
            toast.error('Error loading schedule data', { position: 'top-right' });
            setLoading(false);
        });

        return () => unsubscribe();
    }, [userId, navigate, currentUserName, currentUserCategory]);

    return {
        userData,
        scheduleData,
        groupedSchedules,
        loading,
        userName,
        userCategory,
        setUserName,
        setUserCategory
    };
}
