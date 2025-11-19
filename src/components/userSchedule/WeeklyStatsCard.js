import React from 'react'

function WeeklyStatsCard({ weeklyStats, overtimeSettings }) {
    return (
        <div className="stats-grid mb-6">
            <div className="stat-card">
                <div className="stat-value">{weeklyStats.scheduledHours}</div>
                <div className="stat-label">Scheduled Hours (Current Week)</div>
            </div>
            <div className="stat-card success">
                <div className="stat-value">{weeklyStats.workedHours}</div>
                <div className="stat-label">Worked Hours (Current Week) {weeklyStats.overtimeHours > 0 && (
                    <span className="block text-xs text-green-700 mt-1">Reg {weeklyStats.regularHours}h  OT {weeklyStats.overtimeHours}h</span>
                )}</div>
            </div>
            <div className="stat-card warning">
                <div className="stat-value">{weeklyStats.efficiency}%</div>
                <div className="stat-label">Efficiency (Current Week)</div>
            </div>
            <div className="stat-card">
                <div className="stat-value">${weeklyStats.weeklyEarnings} CAD</div>
                <div className="stat-label">Weekly Earnings (Current Week)                   
                </div>
            </div>
        </div>
    )
}

export default WeeklyStatsCard
