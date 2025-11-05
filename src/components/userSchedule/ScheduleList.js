import React from 'react'
import { format, isToday as isTodayFn } from 'date-fns'
import { parseDate } from '../../utils/scheduleUtils'
import ShiftItem from './ShiftItem'

function ScheduleList({ groupedSchedules, scheduleData, quickCheckIn, quickCheckOut, editInOutTime, isUpdating }) {
    const keys = Object.keys(groupedSchedules).sort();

    if (keys.length === 0) {
        return (
            <div className="card text-center">
                <div className="py-8">
                    <h2 className="text-xl font-semibold text-gray-600 mb-4">📅 No Schedule Found</h2>
                    <p className="text-gray-500 mb-6">You don't have any scheduled shifts yet.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="card animate-slide-in">
            <div className="card-header">
                <h2 className="card-title">📊 Schedules by Date</h2>
                <p className="text-sm text-gray-600">Shifts organized by day with daily totals</p>
            </div>

            <div className="card-body h-48 overflow-y-auto">
                <div className="space-y-6">
                    {keys.map(date => {
                        const dayData = groupedSchedules[date];
                        const shifts = dayData.shifts;
                        const totals = dayData.totals;
                        const dateObj = parseDate(date);
                        const isTodayDate = isTodayFn(dateObj);

                        return (
                            <div key={date} id={`date-${date}`} className={`border rounded-lg overflow-hidden ${isTodayDate ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
                                <div className={`px-4 py-3 border-b ${isTodayDate ? 'bg-blue-100 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <h3 className="font-semibold text-lg">{isTodayDate && '🌟 '}{format(dateObj, 'EEEE, dd/MM/yyyy')}{isTodayDate && ' (Today)'}</h3>
                                            <p className="text-sm text-gray-600">{totals.totalShifts} scheduled shift{totals.totalShifts !== 1 ? 's' : ''}</p>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm text-gray-600">📅 {totals.scheduledHours}h scheduled</div>
                                            <div className="text-sm font-medium text-green-600">✅ {totals.workedHours}h worked</div>
                                            <div className="text-xs text-gray-500">{totals.completedShifts}/{totals.totalShifts} completed</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="divide-y divide-gray-100">
                                    {shifts.map((shift, index) => (
                                        <ShiftItem
                                            key={shift.id || index}
                                            shift={shift}
                                            index={index}
                                            shifts={shifts}
                                            quickCheckIn={quickCheckIn}
                                            quickCheckOut={quickCheckOut}
                                            editInOutTime={editInOutTime}
                                            isUpdating={isUpdating}
                                        />
                                    ))}
                                </div>

                                {totals.totalShifts > 1 && (
                                    <div className="px-4 py-3 bg-gray-50 border-t">
                                        <div className="flex justify-between items-center text-sm">
                                            <div className="text-gray-600">📊 Day Total ({totals.totalShifts} shifts):</div>
                                            <div className="flex gap-4 font-medium">
                                                <span className="text-blue-600">📅 {totals.scheduledHours}h scheduled</span>
                                                <span className="text-green-600">✅ {totals.workedHours}h worked</span>
                                                <span className={totals.workedHours > totals.scheduledHours ? 'text-orange-600' : 'text-gray-600'}>📈 {totals.scheduledHours > 0 ? `${((totals.workedHours / totals.scheduledHours) * 100).toFixed(1)}%` : '0%'} efficiency</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

export default ScheduleList
