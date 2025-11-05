import React from 'react'

function WeeklyStatsCard({ weeklyStats, overtimeSettings }) {
    return (
        <div className="stats-grid mb-6">
            <div className="stat-card">
                <div className="stat-value">{weeklyStats.scheduledHours}</div>
                <div className="stat-label">Scheduled Hours</div>
            </div>
            <div className="stat-card success">
                <div className="stat-value">{weeklyStats.workedHours}</div>
                <div className="stat-label">Worked Hours {weeklyStats.overtimeHours > 0 && (
                    <span className="block text-xs text-green-700 mt-1">Reg {weeklyStats.regularHours}h • OT {weeklyStats.overtimeHours}h</span>
                )}</div>
            </div>
            <div className="stat-card warning">
                <div className="stat-value">{weeklyStats.efficiency}%</div>
                <div className="stat-label">Efficiency</div>
            </div>
            <div className="stat-card">
                <div className="stat-value">${weeklyStats.weeklyEarnings}</div>
                <div className="stat-label">Weekly Earnings (CAD)
                    {(weeklyStats.overtimeEarnings > 0 || weeklyStats.regularEarnings > 0) && (
                        <span className="block text-xs text-gray-600 mt-1">
                            Reg ${weeklyStats.regularEarnings.toFixed(2)}{weeklyStats.overtimeEarnings > 0 && ` • OT $${weeklyStats.overtimeEarnings.toFixed(2)}`}
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}

export default WeeklyStatsCard
