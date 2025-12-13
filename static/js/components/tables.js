// =============================================================================
// SPX Options Monitor - Tables Component
// Renders data tables for Latest, Intraday, Daily, and Alerts tabs
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
            return '<div class="content-loading">No data available</div>';
        }

        const suffix = (typeof MoversComponent !== 'undefined')
            ? (MoversComponent.comparisonMode === 'hour' ? '_hour' : '_eod')
            : '_hour';

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
                            <th class="number">Vol Chg</th>
                            <th class="number">OI</th>
                            <th class="number">Price</th>
                            <th class="number">Notional</th>
                            <th class="number">Delta</th>
                            <th class="number">IV</th>
                            <th>Flags</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        for (const row of rows) {
            const notional = (row.volume_today || row.volume_cumulative || 0) * (row.close_price || 0) * 100;
            const volDelta = row['volume_delta' + suffix] || row.volume_delta || 0;
            const volPct = row['volume_pct_change' + suffix];
            const volDeltaClass = volDelta > 0 ? 'positive' : (volDelta < 0 ? 'negative' : '');

            // Format volume change
            let volDeltaStr = '-';
            if (volDelta !== 0) {
                volDeltaStr = (volDelta > 0 ? '+' : '') + Utils.formatNumber(volDelta);
                if (volPct !== null && volPct !== undefined) {
                    volDeltaStr += ` (${volPct > 0 ? '+' : ''}${volPct.toFixed(0)}%)`;
                }
            }

            // Render flags
            let flagsHtml = '';
            if (row.flags && row.flags.length > 0) {
                flagsHtml = row.flags.map(f => `<span class="flag ${f}">${f}</span>`).join('');
            }

            html += `
                <tr>
                    <td>${row.captured_at ? Utils.formatTime(row.captured_at) : '-'}</td>
                    ${showExpiration ? `<td><span class="exp-badge">${row.expiration || '-'}</span></td>` : ''}
                    <td>${row.strike}</td>
                    <td class="moneyness">${Utils.formatPercent(row.moneyness)}</td>
                    <td>${row.dte}</td>
                    <td class="number">${Utils.formatNumber(row.volume_today || row.volume_cumulative)}</td>
                    <td class="number ${volDeltaClass}">${volDeltaStr}</td>
                    <td class="number">${Utils.formatNumber(row.open_interest)}</td>
                    <td class="number">${Utils.formatMoney(row.close_price)}</td>
                    <td class="number">${Utils.formatMoney(notional)}</td>
                    <td class="number">${row.delta ? row.delta.toFixed(4) : '-'}</td>
                    <td class="number">${row.implied_vol ? (row.implied_vol * 100).toFixed(1) + '%' : '-'}</td>
                    <td>${flagsHtml}</td>
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
            return '<div class="content-loading">No daily history available</div>';
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
                            <th class="number">Volume</th>
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
                    <td>${row.trade_date || '-'}</td>
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
            return '<div class="content-loading">No alerts recorded</div>';
        }

        let html = `
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Strike</th>
                            <th>Exp</th>
                            <th class="number">Volume</th>
                            <th class="number">Notional</th>
                            <th>Flags</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        for (const row of rows) {
            // Parse flags from trigger_reasons
            let flagsHtml = '';
            try {
                const reasons = JSON.parse(row.trigger_reasons || '{}');
                if (reasons.flags && Array.isArray(reasons.flags)) {
                    flagsHtml = reasons.flags.map(f => `<span class="flag ${f}">${f}</span>`).join('');
                }
            } catch (e) {
                // Ignore parse errors
            }

            html += `
                <tr class="alert-row">
                    <td>${row.triggered_at ? row.triggered_at.substring(0, 16).replace('T', ' ') : '-'}</td>
                    <td>${row.strike}</td>
                    <td><span class="exp-badge">${row.expiration || '-'}</span></td>
                    <td class="number">${Utils.formatNumber(row.volume_current)}</td>
                    <td class="number">${Utils.formatMoney(row.premium_notional)}</td>
                    <td>${flagsHtml}</td>
                </tr>
            `;
        }

        html += '</tbody></table></div>';
        return html;
    }
};

// =============================================================================
// Global function aliases for backward compatibility
// =============================================================================
const renderSnapshotTable = (rows, showExpiration) => TablesComponent.renderSnapshot(rows, showExpiration);
const renderDailyTable = (rows) => TablesComponent.renderDaily(rows);
const renderAlertsTable = (rows) => TablesComponent.renderAlerts(rows);
