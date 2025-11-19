import { useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import useProfileLoader from '../hooks/useProfileLoader';
import useProfileEditor from '../hooks/useProfileEditor';

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

  // Use custom hooks
  const {
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
  } = useProfileLoader(userId, navigate, backTo);

  const {
    saving,
    effectiveFrom,
    setEffectiveFrom,
    handleSave
  } = useProfileEditor(
    userId,
    origUser,
    { firstName, lastName, category, hourlyWage, email, isActive },
    navigate,
    backTo
  );

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

export default EditProfilePage;
