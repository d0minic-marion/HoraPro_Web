import React from 'react'
import { Calendar, momentLocalizer } from 'react-big-calendar'
import moment from 'moment'
import { format } from 'date-fns'

const localizer = momentLocalizer(moment);

function CalendarPanel({ calendarEvents, eventStyleGetter, handleSelectSlot, handleEventClick, scheduleData }) {
    return (
        <div className="card animate-slide-in">
            <div className="card-header">
                <h2 className="card-title">📅 Calendar View</h2>
            </div>

            <div className="calendar-legend mb-4">
                <h3 className="legend-title">Schedule Status</h3>
                <div className="legend-items">
                    <div className="legend-item"><div className="legend-color" style={{ backgroundColor: '#10b981' }}></div><span>Completed</span></div>
                    <div className="legend-item"><div className="legend-color" style={{ backgroundColor: '#f59e0b' }}></div><span>In Progress</span></div>
                    <div className="legend-item"><div className="legend-color" style={{ backgroundColor: '#2563eb' }}></div><span>Scheduled</span></div>
                    <div className="legend-item"><div className="legend-color" style={{ backgroundColor: '#ef4444' }}></div><span>Missed</span></div>
                </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2 text-blue-800">
                    <span className="text-lg">✨</span>
                    <span className="font-medium">Quick Shift Creation:</span>
                    <span className="text-sm">Click and drag on the calendar to create a new shift</span>
                </div>
            </div>

            <Calendar
                localizer={localizer}
                events={calendarEvents}
                startAccessor="start"
                endAccessor="end"
                style={{ height: 600 }}
                eventPropGetter={eventStyleGetter}
                views={['month', 'week', 'day', 'agenda']}
                defaultView="week"
                step={15}
                timeslots={4}
                min={new Date(0, 0, 0, 0, 0, 0)}
                max={new Date(0, 0, 0, 23, 59, 0)}
                selectable={true}
                onSelectSlot={handleSelectSlot}
                formats={{
                    timeGutterFormat: 'HH:mm',
                    eventTimeRangeFormat: ({ start, end }) => `${format(start, 'HH:mm')} - ${format(end, 'HH:mm')}`
                }}
                onSelectEvent={(event) => {
                    const schedule = scheduleData.find(s => s.id === event.id);
                    if (schedule) {
                        handleEventClick(schedule);
                    }
                }}
            />
        </div>
    )
}

export default CalendarPanel
