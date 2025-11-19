import { useState, useEffect } from 'react';
import { dbFirestore } from '../connections/ConnFirebaseServices';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'react-toastify';

/**
 * Custom hook to manage global overtime settings
 * Loads from SystemSettings/OvertimeRules and provides save functionality
 * @returns {Object} - { otThreshold, setOtThreshold, otPercent, setOtPercent, otUpdatedAt, otLoading, otSaving, saveOvertime }
 */
function useOvertimeSettings() {
    const [otThreshold, setOtThreshold] = useState('40');
    const [otPercent, setOtPercent] = useState('50');
    const [otUpdatedAt, setOtUpdatedAt] = useState(null);
    const [otSaving, setOtSaving] = useState(false);
    const [otLoading, setOtLoading] = useState(true);

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

    return {
        otThreshold,
        setOtThreshold,
        otPercent,
        setOtPercent,
        otUpdatedAt,
        otLoading,
        otSaving,
        saveOvertime
    };
}

export default useOvertimeSettings;
