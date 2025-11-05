import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { dbFirestore } from '../connections/ConnFirebaseServices';
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { syncWeeklyEarningsForUserWeek } from '../utils/earningsHelpers';
import { startOfWeek, endOfWeek } from 'date-fns';

const jobCategories = [
  'Full-Time Employee',
  'Part-Time Employee',
  'Contractor',
  'Intern',
  'Manager / Supervisor',
];

function EditProfilePage() {
  const navigate = useNavigate();
  const { userId } = useParams();
  const location = useLocation();
  const backTo = location.state?.backTo || '/schedulizer';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form fields (existing user fields only; no new schema fields)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [category, setCategory] = useState('');
  const [hourlyWage, setHourlyWage] = useState('');
  const [email, setEmail] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [effectiveFrom, setEffectiveFrom] = useState('');

  const [origUser, setOrigUser] = useState(null);

  const hasChanges = useMemo(() => {
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
  }, [origUser, firstName, lastName, category, hourlyWage, email, isActive]);

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

  async function handleSave(e) {
    e?.preventDefault();
    if (!origUser) return;
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

  if (loading) {
    return (
      <div className="loading">
        <span className="spinner"></span>
        Loading profile...
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="card">
        <div className="card-header">
          <h1 className="card-title">Edit Profile</h1>
          <p className="card-subtitle">
            Update employee information. Changing hourly wage can affect earnings calculation.
          </p>
        </div>

        <form onSubmit={handleSave} className="grid md:grid-cols-2 gap-4">
          {/* First Name */}
          <div className="form-group">
            <label className="form-label" htmlFor="firstName">First Name *</label>
            <input
              id="firstName"
              type="text"
              className="form-input"
              value={firstName}
              disabled={saving}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>

          {/* Last Name */}
          <div className="form-group">
            <label className="form-label" htmlFor="lastName">Last Name *</label>
            <input
              id="lastName"
              type="text"
              className="form-input"
              value={lastName}
              disabled={saving}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>

          {/* Category */}
          <div className="form-group">
            <label className="form-label" htmlFor="category">Category / Role *</label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="form-select"
              disabled={saving}
            >
              <option value="">Select a category</option>
              {jobCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Hourly Wage */}
          <div className="form-group">
            <label className="form-label" htmlFor="hourlyWage">Hourly Wage (CAD)</label>
            <input
              id="hourlyWage"
              type="number"
              min={15.75}
              max={500}
              step={0.01}
              className="form-input"
              value={hourlyWage}
              disabled={saving}
              onChange={(e) => setHourlyWage(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">Minimum suggested: 15.75 CAD / hour</p>
          </div>

          {/* Wage Effective From (shown only if wage changed) */}
          {origUser && (() => {
            const oldW = Number(origUser.hourlyWage || 0);
            const newW = Number(hourlyWage);
            const changed = hourlyWage !== '' && !Number.isNaN(newW) && newW !== oldW;
            if (!changed) return null;
            return (
              <div className="form-group">
                <label className="form-label" htmlFor="effectiveFrom">Wage Effective From (YYYY-MM-DD)</label>
                <input
                  id="effectiveFrom"
                  type="date"
                  className="form-input"
                  value={effectiveFrom}
                  disabled={saving}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">New hourly wage applies from this date going forward.</p>
              </div>
            );
          })()}

          {/* Email */}
          <div className="form-group md:col-span-2">
            <label className="form-label" htmlFor="email">Email *</label>
            <input
              id="email"
              type="email"
              className="form-input"
              value={email}
              disabled={saving}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              Note: Changing this only updates the Firestore profile. To change the authentication email, use the employee app or an admin auth flow.
            </p>
          </div>

          {/* Active toggle */}
          <div className="form-group md:col-span-2 flex items-center gap-2">
            <input
              id="isActive"
              type="checkbox"
              className="form-checkbox"
              checked={isActive}
              disabled={saving}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <label htmlFor="isActive" className="form-label !mb-0">Active</label>
          </div>

          {/* Actions */}
          <div className="md:col-span-2 flex gap-2 mt-2">
            <button type="submit" className="btn btn-primary" disabled={saving || !hasChanges}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => navigate(backTo)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Helper to format a Date to 'YYYY-MM-DD'
function formatDateYYYYMMDD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default EditProfilePage;
