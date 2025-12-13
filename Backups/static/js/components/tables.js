// =============================================================================
// SPX Options Monitor - Tables Component
// Renders data tables for Latest, Intraday, Daily, and Alerts tabs
// Depends on: utils.js
// =============================================================================

const TablesComponent = {
    /**
     * Renders snapshot table (used by Latest & Intraday tabs)
     * @param {Array} rows - Array of snapshot data
     * @param {boolean} showExpiration - Whether to show expiration column
     * @returns {string} HTML string
     */
    renderSnapshot(rows, showExpiration = false) {
        if (!rows.length) {
            return '<div class="loading">No data available</div>';
        }

        let html = `
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Time</th>
                            ${showExpiration ? '<th>Exp</th>' : ''}
                            <th>Strike</th>
                            <th>M%</th>
                            <th>DTE</th>
                            <th class="number">Vol</th>
                            <th class="number">Δ</th>
                            <th class="number">OI</th>
                            <th class="number">Price</th>
                            <th class="number">Notional</th>
                            <th class="number">Delta</th>
                            <th class="number">IV</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        for (const row of rows) {
            const notional = (row.volume_cumulative || 0) * (row.close_price || 0) * 100;
            const volDeltaClass = row.volume_delta > 0 ? 'positive' : '';

            html += `
                <tr>
                    <td>${row.captured_at ? row.captured_at.substring(11, 16) : '-'}</td>
                    ${showExpiration ? `<td><span class="exp-badge">${row.expiration || '-'}</span></td>` : ''}
                    <td>${row.strike}</td>
                    <td class="moneyness">${Utils.formatPercent(row.moneyness)}</td>
                    <td>${row.dte}</td>
                    <td class="number">${Utils.formatNumber(row.volume_cumulative)}</td>
                    <td class="number ${volDeltaClass}">${row.volume_delta ? '+' + Utils.formatNumber(row.volume_delta) : '-'}</td>
                    <td class="number">${Utils.formatNumber(row.open_interest)}</td>
                    <td class="number">${Utils.formatMoney(row.close_price)}</td>
                    <td class="number">${Utils.formatMoney(notional)}</td>
                    <td class="number">${row.delta ? row.delta.toFixed(4) : '-'}</td>
                    <td class="number">${row.implied_vol ? (row.implied_vol * 100).toFixed(1) + '%' : '-'}</td>
                </tr>
            `;
        }

        html += '</tbody></table></div>';
        return html;
    },

    /**
     * Renders daily historical table
     * @param {Array} rows - Array of daily data
     * @returns {string} HTML string
     */
    renderDaily(rows) {
        if (!rows.length) {
            return '<div class="loading">No daily history</div>';
        }

        let html = `
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Exp</th>
                            <th>Strike</th>
                            <th>M%</th>
                            <th>DTE</th>
                            <th class="number">Vol</th>
                            <th class="number">OI</th>
                            <th class="number">Close</th>
                            <th class="number">Delta</th>
                            <th class="number">IV</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        for (const row of rows) {
            html += `
                <tr>
                    <td>${row.trade_date}</td>
                    <td><span class="exp-badge">${row.expiration || '-'}</span></td>
                    <td>${row.strike}</td>
                    <td class="moneyness">${Utils.formatPercent(row.moneyness)}</td>
                    <td>${row.dte}</td>
                    <td class="number">${Utils.formatNumber(row.volume)}</td>
                    <td class="number">${Utils.formatNumber(row.open_interest)}</td>
                    <td class="number">${Utils.formatMoney(row.close_price)}</td>
                    <td class="number">${row.delta ? row.delta.toFixed(4) : '-'}</td>
                    <td class="number">${row.implied_vol ? (row.implied_vol * 100).toFixed(1) + '%' : '-'}</td>
                </tr>
            `;
        }

        html += '</tbody></table></div>';
        return html;
    },

    /**
     * Renders alerts table
     * @param {Array} rows - Array of alert data
     * @returns {string} HTML string
     */
    renderAlerts(rows) {
        if (!rows.length) {
            return '<div class="loading">No alerts</div>';
        }

        let html = `
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Strike</th>
                            <th>Exp</th>
                            <th class="number">Vol</th>
                            <th class="number">Notional</th>
                            <th>Flags</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        for (const row of rows) {
            let flags = '';
            try {
                const reasons = JSON.parse(row.trigger_reasons || '{}');
                if (reasons.flags) {
                    flags = reasons.flags.map(f => `<span class="flag ${f}">${f}</span>`).join('');
                }
            } catch (e) {}

            html += `
                <tr class="alert-row">
                    <td>${row.triggered_at ? row.triggered_at.substring(0, 16) : '-'}</td>
                    <td>${row.strike}</td>
                    <td><span class="exp-badge">${row.expiration}</span></td>
                    <td class="number">${Utils.formatNumber(row.volume_current)}</td>
                    <td class="number">${Utils.formatMoney(row.premium_notional)}</td>
                    <td>${flags}</td>
                </tr>
            `;
        }

        html += '</tbody></table></div>';
        return html;
    }
};

// Backward compatibility - global function aliases
const renderSnapshotTable = (rows, showExpiration) => TablesComponent.renderSnapshot(rows, showExpiration);
const renderDailyTable = (rows) => TablesComponent.renderDaily(rows);
const renderAlertsTable = (rows) => TablesComponent.renderAlerts(rows);
