import React from 'react'
import { differenceInMinutes } from 'date-fns'
import { parseDate, parseDateTime } from '../../utils/scheduleUtils'
import { getShiftStatus as getShiftStatusUtil } from '../../utils/scheduleUtils'
import { computeWorkedHoursForShift } from '../../utils/timeHelpers'

const timeFormatter = new Intl.DateTimeFormat('en-CA', {
    hour: '2-digit',
    minute: '2-digit'
});

function toJSDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === 'function') return value.toDate();
    return null;
}

function formatDateYYYYMMDD(dateObj) {
    if (!(dateObj instanceof Date)) return '';
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function ShiftItem({ shift, index, shifts, quickCheckIn, quickCheckOut, editInOutTime, isUpdating }) {
    const statusInfo = getShiftStatusUtil(shift);

    const canCheckIn = (() => {
        try {
            const dateObj = parseDate(shift.eventDate);
            const today = new Date();
            return dateObj.toDateString() === today.toDateString() && !shift.checkedInTime;
        } catch { return false }
    })();

    const canCheckOut = shift.checkedInTime && !shift.checkedOutTime;

    const scheduledDurationText = (() => {
        try {
            const start = parseDateTime(shift.eventDate, shift.startHour);
            let end;
            if (shift.isContinuation) {
                end = parseDateTime(shift.eventDate, shift.endHour);
            } else if (shift.endDate && shift.endDate !== shift.eventDate) {
                const firstDayEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999);
                end = firstDayEnd;
            } else {
                const endBaseDate = (shift.endDate && shift.endDate !== shift.eventDate) ? shift.endDate : shift.eventDate;
                end = parseDateTime(endBaseDate, shift.endHour);
                if ((shift.overnight || shift.endHour <= shift.startHour) && !shift.isContinuation) {
                    const firstDayEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999);
                    end = firstDayEnd;
                }
            }
            const hrs = differenceInMinutes(end, start) / 60;
            return `${hrs.toFixed(2)}h scheduled`;
        } catch { return ''; }
    })();

    const actualWorkedHours = (() => {
        const worked = computeWorkedHoursForShift(shift);
        if (typeof worked === 'number' && !Number.isNaN(worked)) {
            return Number(worked.toFixed(2));
        }
        if (typeof shift.totalHoursDay === 'number' && !Number.isNaN(shift.totalHoursDay)) {
            return Number(shift.totalHoursDay.toFixed(2));
        }
        return null;
    })();

    const resolvedCheckInDate = (() => {
        const ts = toJSDate(shift.checkInTimestamp);
        if (ts) return ts;
        if (shift.eventDate && shift.checkedInTime) {
            try {
                return parseDateTime(shift.eventDate, shift.checkedInTime);
            } catch {
                return null;
            }
        }
        return null;
    })();

    const fallbackStartReference = (() => {
        if (!shift.eventDate) return null;
        const sourceHour = shift.checkedInTime || shift.startHour;
        if (!sourceHour) return null;
        try {
            return parseDateTime(shift.eventDate, sourceHour);
        } catch {
            return null;
        }
    })();

    const resolvedCheckOutDate = (() => {
        const ts = toJSDate(shift.checkOutTimestamp);
        if (ts) return ts;
        if (shift.eventDate && shift.checkedOutTime) {
            try {
                let baseDate = shift.endDate && shift.endDate !== shift.eventDate
                    ? shift.endDate
                    : shift.eventDate;
                let end = parseDateTime(baseDate, shift.checkedOutTime);

                const startReference = resolvedCheckInDate || fallbackStartReference;

                const needsNextDayAdjustment = (() => {
                    if (shift.endDate && shift.endDate !== shift.eventDate) return false;
                    if (shift.overnight) return true;
                    if (startReference && end <= startReference) return true;
                    return false;
                })();

                if (needsNextDayAdjustment) {
                    const nextDay = parseDate(shift.eventDate);
                    nextDay.setDate(nextDay.getDate() + 1);
                    const nextDayStr = formatDateYYYYMMDD(nextDay);
                    end = parseDateTime(nextDayStr, shift.checkedOutTime);
                }

                return end;
            } catch {
                return null;
            }
        }
        return null;
    })();

    const checkInLabel = resolvedCheckInDate
        ? timeFormatter.format(resolvedCheckInDate)
        : (shift.checkedInTime || '');

    const checkOutLabel = resolvedCheckOutDate
        ? timeFormatter.format(resolvedCheckOutDate)
        : (shift.checkedOutTime || '');

    const showNextDayHint = Boolean(
        checkOutLabel &&
        (
            shift.overnight ||
            (shift.endDate && shift.endDate !== shift.eventDate) ||
            (resolvedCheckInDate && resolvedCheckOutDate &&
                resolvedCheckInDate.toDateString() !== resolvedCheckOutDate.toDateString())
        )
    );

    return (
        <div className="px-4 py-3 hover:bg-gray-50">
            <div className="flex justify-between items-center">
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-lg font-mono font-semibold">
                            {shift.startHour} - {shift.endHour}
                            {shift.isContinuation ? ' (cont.)' : ''}
                            {(shift.overnight || (shift.endDate && shift.endDate !== shift.eventDate)) && (
                                <span className="text-sm text-gray-500 ml-2">(next day)</span>
                            )}
                        </span>
                        <span className={`px-2 py-1 rounded text-sm font-medium ${statusInfo.bgColor} ${statusInfo.textColor}`}>
                            {statusInfo.label}
                        </span>
                        <span className="text-sm text-gray-500">({scheduledDurationText})</span>
                    </div>

                    <div className="text-gray-700 mb-2"> {shift.eventDescription}</div>

                    <div className="flex gap-6 text-sm">
                        <div className="flex items-center gap-1">
                            <span style={{ fontWeight: 700, color: '#111827', marginRight:'0.2rem' }}>Check-in:</span>
                            <span className={`${checkInLabel ? 'text-green-600' : 'text-gray-400'} font-semibold`}>
                                {checkInLabel || 'Not recorded'}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span style={{ fontWeight: 700, color: '#111827', marginRight:'0.2rem', marginLeft: '0.5rem' }}> Check-out:</span>
                            <span className={`${checkOutLabel ? 'text-blue-600' : 'text-gray-400'} font-semibold`}>
                                {checkOutLabel || 'Not recorded'}
                            </span>
                            {showNextDayHint && (
                                <span className="text-xs text-gray-500 ml-1">(next day)</span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            <span style={{ fontWeight: 700, color: '#111827', marginRight: '0.2rem', marginLeft: '0.5rem' }}> Total:</span>
                            <span className={actualWorkedHours != null ? 'text-green-600 font-semibold' : 'text-gray-400 font-semibold'}>
                                {actualWorkedHours != null ? `${actualWorkedHours}h` : '-'}
                            </span>
                        </div>
                    </div>

                </div>

                <div className="flex gap-2 ml-4">
                    {canCheckIn && (
                        <button
                            onClick={() => quickCheckIn(shift)}
                            className="btn btn-success btn-sm"
                            disabled={isUpdating}
                            title="Quick Check-In"
                        >
                             Check In
                        </button>
                    )}
                    {canCheckOut && (
                        <button
                            onClick={() => quickCheckOut(shift)}
                            className="btn btn-warning btn-sm"
                            disabled={isUpdating}
                            title="Quick Check-Out"
                        >
                             Check Out
                        </button>
                    )}
                    {!shift.isContinuation && (
                        <button
                            onClick={() => editInOutTime(shift)}
                            className="btn btn-primary btn-sm"
                            title="Edit Shift"
                        >
                             Edit Shift
                        </button>
                    )}
                </div>
            </div>

            {/* Breaks between shifts */}
            {index < shifts.length - 1 && (() => {
                try {
                    const nextShift = shifts[index + 1];
                    const currentEnd = new Date(`${shift.eventDate}T${shift.endHour}`);
                    const nextStart = new Date(`${nextShift.eventDate}T${nextShift.startHour}`);
                    const breakMinutes = differenceInMinutes(nextStart, currentEnd);

                    if (breakMinutes > 0) {
                        return (
                            <div className="mt-3 pt-2 border-t border-dashed border-gray-300">
                                <div className={`text-xs text-center py-1 px-2 rounded ${breakMinutes >= 30 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                     Break: {Math.floor(breakMinutes / 60)}h {breakMinutes % 60}m{breakMinutes < 30 && ' ( Less than 30 min recommended)'}
                                </div>
                            </div>
                        )
                    }
                } catch { return null }
                return null
            })()}
        </div>
    )
}

export default ShiftItem

