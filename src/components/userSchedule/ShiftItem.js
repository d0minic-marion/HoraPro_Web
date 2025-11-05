import React from 'react'
import { differenceInMinutes } from 'date-fns'
import { parseDateTime } from '../../utils/scheduleUtils'
import { getShiftStatus as getShiftStatusUtil } from '../../utils/scheduleUtils'

function ShiftItem({ shift, index, shifts, quickCheckIn, quickCheckOut, editInOutTime, isUpdating }) {
    const statusInfo = getShiftStatusUtil(shift);

    const canCheckIn = (() => {
        try {
            const dateObj = new Date(shift.eventDate);
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
                end = parseDateTime(shift.eventDate, shift.endHour);
                if ((shift.overnight || shift.endHour <= shift.startHour) && !shift.isContinuation) {
                    const firstDayEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999);
                    end = firstDayEnd;
                }
            }
            const hrs = differenceInMinutes(end, start) / 60;
            return `${hrs.toFixed(2)}h scheduled`;
        } catch { return '—' }
    })();

    return (
        <div className="px-4 py-3 hover:bg-gray-50">
            <div className="flex justify-between items-center">
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-lg font-mono font-semibold">
                            {shift.startHour} - {shift.endHour}{shift.isContinuation ? ' (cont.)' : ''}{(shift.overnight || shift.isContinuation) && ' 🌙'}
                        </span>
                        <span className={`px-2 py-1 rounded text-sm font-medium ${statusInfo.bgColor} ${statusInfo.textColor}`}>
                            {statusInfo.label}
                        </span>
                        <span className="text-sm text-gray-500">({scheduledDurationText})</span>
                    </div>

                    <div className="text-gray-700 mb-2">📝 {shift.eventDescription}</div>

                    <div className="flex gap-6 text-sm">
                        <div className="flex items-center gap-1">
                            <span>🕐 Check-in:</span>
                            <span className={shift.checkedInTime ? 'text-green-600 font-mono' : 'text-gray-400'}>
                                {shift.checkedInTime || 'Not recorded'}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span>🏁 Check-out:</span>
                            <span className={shift.checkedOutTime ? 'text-blue-600 font-mono' : 'text-gray-400'}>
                                {shift.checkedOutTime || 'Not recorded'}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span>⏱️ Total:</span>
                            <span className={shift.totalHoursDay ? 'text-green-600 font-semibold' : 'text-gray-400'}>
                                {shift.totalHoursDay ? `${shift.totalHoursDay}h` : '-'}
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
                            🕐 Check In
                        </button>
                    )}
                    {canCheckOut && (
                        <button
                            onClick={() => quickCheckOut(shift)}
                            className="btn btn-warning btn-sm"
                            disabled={isUpdating}
                            title="Quick Check-Out"
                        >
                            🏁 Check Out
                        </button>
                    )}
                    {!shift.isContinuation && (
                        <button
                            onClick={() => editInOutTime(shift)}
                            className="btn btn-primary btn-sm"
                            title="Edit Times"
                        >
                            ✏️ Edit
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
                                    ⏸️ Break: {Math.floor(breakMinutes / 60)}h {breakMinutes % 60}m{breakMinutes < 30 && ' (⚠️ Less than 30 min recommended)'}
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
