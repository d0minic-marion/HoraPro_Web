import { useState } from 'react';
import { dbFirestore } from '../connections/ConnFirebaseServices';
import { doc, setDoc, collection, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { syncWeeklyEarningsForUserWeek } from '../utils/earningsHelpers';
import { startOfWeek, endOfWeek } from 'date-fns';

/**
 * Custom hook for profile editing logic
 * Handles save, wage history, and earnings recalculation
 * @param {string} userId - User ID
 * @param {Object} origUser - Original user data
 * @param {Object} formData - Current form field values
 * @param {function} navigate - Navigation function
 * @param {string} backTo - Path to navigate back after save
 * @returns {Object} - { saving, effectiveFrom, setEffectiveFrom, handleSave }
 */
function useProfileEditor(userId, origUser, formData, navigate, backTo) {
    const [saving, setSaving] = useState(false);
    const [effectiveFrom, setEffectiveFrom] = useState('');

    async function handleSave(e) {
        e?.preventDefault();
        if (!origUser) return;

        const { firstName, lastName, category, hourlyWage, email, isActive } = formData;

        // Check for changes
        const hasChanges = (() => {
            if (!origUser) return false;
            const hw = hourlyWage === '' ? '' : Number(hourlyWage);
            return (
                firstName !== (origUser.firstName || '') ||
                lastName !== (origUser.lastName || '') ||
                category !== (origUser.category || '') ||
                (hourlyWage !== '' && hw !== Number(origUser.hourlyWage || 0)) ||
                email !== (origUser.email || '') ||
                isActive !== Boolean(origUser.isActive)
            );
        })();

        if (!hasChanges) {
            toast.info('No changes to save');
            return;
        }

        // Basic validations
        const fn = (firstName || '').trim();
        const ln = (lastName || '').trim();
        if (fn.length < 2 || ln.length < 2) {
            toast.error('First and Last name must be at least 2 characters');
            return;
        }
        if (!category) {
            toast.error('Please select a category');
            return;
        }
        let wageNum = undefined;
        const wageChangedUI = (() => {
            if (!origUser) return false;
            if (hourlyWage === '') return false;
            const newW = Number(hourlyWage);
            const oldW = Number(origUser.hourlyWage || 0);
            if (Number.isNaN(newW)) return false;
            return newW !== oldW;
        })();
        if (hourlyWage !== '') {
            wageNum = Number(hourlyWage);
            if (Number.isNaN(wageNum) || wageNum < 15.75) {
                toast.error('Hourly wage must be a valid number (>= 15.75)');
                return;
            }
            // Require Effective From only when wage actually changes
            if (wageChangedUI && !effectiveFrom) {
                toast.error('Please select the Effective From date for the new hourly wage');
                return;
            }
        }
        if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
            toast.error('Please provide a valid email');
            return;
        }

        setSaving(true);
        try {
            const ref = doc(dbFirestore, 'users', userId);
            const patch = {
                firstName: fn,
                lastName: ln,
                category,
                email: email.trim(),
                isActive,
            };
            if (wageNum !== undefined) patch.hourlyWage = wageNum;

            await setDoc(ref, patch, { merge: true });
            toast.success('Profile updated');

            // Recompute current week earnings automatically when wage changed and effectiveFrom provided
            const wageChanged =
                (typeof origUser.hourlyWage === 'number' ? origUser.hourlyWage : undefined) !== wageNum &&
                wageNum !== undefined;
            // Record wage history if wage changed
            if (wageChanged) {
                try {
                    const histCol = collection(dbFirestore, 'users', userId, 'WageHistory');
                    await addDoc(histCol, {
                        rate: wageNum,
                        effectiveFrom: effectiveFrom,
                        createdAt: serverTimestamp(),
                    });

                    // Ensure there is a prior baseline entry so dates before effectiveFrom keep the old wage
                    try {
                        const snap = await getDocs(histCol);
                        const hasPrior = snap.docs.some(d => {
                            const ef = d.data()?.effectiveFrom;
                            return typeof ef === 'string' && ef < effectiveFrom;
                        });
                        if (!hasPrior && typeof origUser.hourlyWage === 'number') {
                            await addDoc(histCol, {
                                rate: Number(origUser.hourlyWage),
                                effectiveFrom: '0001-01-01',
                                createdAt: serverTimestamp(),
                            });
                        }
                    } catch (err2) {
                        console.error('Failed to ensure baseline WageHistory entry:', err2);
                    }
                } catch (err) {
                    console.error('Failed to save WageHistory entry:', err);
                }
            }

            // Recompute from Effective From week through current week so all derived values use correct wage
            if (wageChanged && effectiveFrom) {
                try {
                    const now = new Date();
                    // Determine recompute end by scanning existing RecordEarnings for max date >= effectiveFrom
                    let lastDateStr = effectiveFrom;
                    try {
                        const recSnap = await getDocs(collection(dbFirestore, 'users', userId, 'RecordEarnings'));
                        recSnap.forEach(d => {
                            const id = d.id; // expected 'YYYY-MM-DD'
                            if (typeof id === 'string' && id >= effectiveFrom) {
                                if (id > lastDateStr) lastDateStr = id;
                            }
                        });
                    } catch {}

                    const lastBoundary = endOfWeek(new Date(lastDateStr > formatDateYYYYMMDD(now) ? lastDateStr : formatDateYYYYMMDD(now)), { weekStartsOn: 1 });
                    let cursor = startOfWeek(new Date(effectiveFrom), { weekStartsOn: 1 });
                    const lastWeekEnd = lastBoundary;
                    while (cursor <= lastWeekEnd) {
                        const wStart = cursor;
                        const wEnd = endOfWeek(cursor, { weekStartsOn: 1 });
                        await syncWeeklyEarningsForUserWeek({
                            userId,
                            userHourlyWage: wageNum,
                            weekStartDate: wStart,
                            weekEndDate: wEnd,
                        });
                        cursor = new Date(cursor.getTime());
                        cursor.setDate(cursor.getDate() + 7);
                    }
                } catch (err) {
                    console.error('Weekly earnings recompute (range) failed:', err);
                }
            }

            navigate(backTo);
        } catch (e) {
            console.error(e);
            toast.error('Failed to update profile');
        } finally {
            setSaving(false);
        }
    }

    return {
        saving,
        effectiveFrom,
        setEffectiveFrom,
        handleSave
    };
}

// Helper to format a Date to 'YYYY-MM-DD'
function formatDateYYYYMMDD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export default useProfileEditor;
