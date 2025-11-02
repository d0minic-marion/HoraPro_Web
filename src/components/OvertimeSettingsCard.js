import { useState, useEffect } from 'react';
import { dbFirestore } from '../connections/ConnFirebaseServices';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'react-toastify';

function OvertimeSettingsCard() {
  const [otThreshold, setOtThreshold] = useState('40'); // Weekly regular hours before overtime
  const [otPercent, setOtPercent] = useState('50');     // Overtime increase (%)
  const [otUpdatedAt, setOtUpdatedAt] = useState(null);
  const [otSaving, setOtSaving] = useState(false);
  const [otLoading, setOtLoading] = useState(true);

  // Load overtime rules when component mounts
  useEffect(() => {
    async function loadOvertime() {
      try {
        const ref = doc(dbFirestore, 'SystemSettings', 'OvertimeRules');
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data();

          const th = parseFloat(data.thresholdHours) || 40;
          const pct = parseFloat(data.overtimePercent) || 50;

          setOtThreshold(String(th));
          setOtPercent(String(pct));

          if (data.updatedAt?.toDate) {
            setOtUpdatedAt(data.updatedAt.toDate());
          }
        } else {
          // Initialize defaults if not present
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

  // Save overtime rule updates
  const saveOvertime = async (e) => {
    e.preventDefault();

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

  return (
    <div className="card">
      <div className="card-header">
        <h1 className="card-title">⚙️ Overtime Settings (Global)</h1>
        <p className="card-subtitle">
          These rules affect all users for weekly earnings & overtime splits
        </p>
      </div>

      <form onSubmit={saveOvertime} className="grid md:grid-cols-3 gap-4">
        {/* Weekly Regular Hours Threshold */}
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

        {/* Overtime Increase % */}
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

        {/* Last Updated */}
        <div className="form-group">
          <label className="form-label">Last Updated</label>
          <div className="p-2 border rounded bg-gray-50 text-sm text-gray-700">
            {otLoading
              ? 'Loading...'
              : otUpdatedAt
              ? otUpdatedAt.toLocaleString()
              : 'No data'}
          </div>
        </div>

        {/* Save button */}
        <div className="md:col-span-3 flex flex-wrap gap-2 mt-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={otSaving || otLoading}
          >
            {otSaving ? 'Saving...' : '💾 Save Overtime Rules'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default OvertimeSettingsCard;
