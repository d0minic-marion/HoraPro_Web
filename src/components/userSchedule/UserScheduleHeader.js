import React from 'react'
import { format } from 'date-fns'

function UserScheduleHeader({ currentUserName, currentUserCategory, currentTime, currentView, setCurrentView }) {
    return (
        <div className="card mb-6">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h1 className="card-title">Employee Schedule - {currentUserName}</h1>
                    <p className="card-subtitle">
                        {currentUserCategory && `${currentUserCategory}  `}Track your work schedule and time entries
                    </p>
                </div>
                <div className="text-right">
                    <div className="current-time">
                        {format(currentTime, 'HH:mm:ss')}
                    </div>
                    <div className="current-date">
                        {format(currentTime, 'EEEE, MMMM dd, yyyy')}
                    </div>
                </div>
            </div>

            <div className="flex gap-2">
                <button
                    onClick={() => setCurrentView('table')}
                    className={`btn ${currentView === 'table' ? 'btn-primary' : 'btn-secondary'}`}
                >
                     Table View
                </button>
                <button
                    onClick={() => setCurrentView('calendar')}
                    className={`btn ${currentView === 'calendar' ? 'btn-primary' : 'btn-secondary'}`}
                >
                    Calendar View
                </button>
            </div>
        </div>
    )
}

export default UserScheduleHeader
