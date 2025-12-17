// =============================================================================
// SPX Options Monitor - Tables Component
// Renders data tables for Latest, Intraday, Daily, and Alerts tabs
// =============================================================================

const TablesComponent = {
    // Sort state for each table type
    sortState: {
        snapshot: { column: null, direction: 'desc' },
        daily: { column: null, direction: 'desc' },
        alerts: { column: null, direction: 'desc' }
    },

    // Store current data for re-sorting
    currentData: {
        snapshot: [],
        daily: [],
        alerts: []
    },

    // Store options for re-rendering
    currentOptions: {
        snapshot: { showExpiration: false }
    },

    /**
     * Column definitions for sorting
     */
    columns: {
        snapshot: [
            { key: 'captured_at', label: 'Time', type: 'time' },
            { key: 'expiration', label: 'Exp', type: 'string', conditional: 'showExpiration' },
            { key: 'strike', label: 'Strike', type: 'number' },
            { key: 'moneyness', label: 'M%', type: 'number' },
            { key: 'dte', label: 'DTE', type: 'number' },
            { key: 'volume', label: 'Vol', type: 'volume', class: 'number' },
            { key: 'volume_pct_change', label: 'Vol Chg', type: 'volChange', class: 'number' },
            { key: 'open_interest', label: 'OI', type: 'number', class: 'number' },
            { key: 'close_price', label: 'Price', type: 'number', class: 'number' },
            { key: 'notional', label: 'Notional', type: 'notional', class: 'number' },
            { key: 'delta', label: 'Delta', type: 'number', class: 'number' },
            { key: 'implied_vol', label: 'IV', type: 'number', class: 'number' },
            { key: 'flags', label: 'Flags', type: 'none' }
        ],
        daily: [
            { key: 'trade_date', label: 'Date', type: 'date' },
            { key: 'expiration', label: 'Exp', type: 'string' },
            { key: 'strike', label: 'Strike', type: 'number' },
            { key: 'moneyness', label: 'M%', type: 'number' },
            { key: 'dte', label: 'DTE', type: 'number' },
            { key: 'volume', label: 'Volume', type: 'number', class: 'number' },
            { key: 'open_interest', label: 'OI', type: 'number', class: 'number' },
            { key: 'close_price', label: 'Close', type: 'number', class: 'number' },
            { key: 'delta', label: 'Delta', type: 'number', class: 'number' },
            { key: 'implied_vol', label: 'IV', type: 'number', class: 'number' }
        ],
        alerts: [
            { key: 'triggered_at', label: 'Time', type: 'datetime' },
            { key: 'strike', label: 'Strike', type: 'number' },
            { key: 'expiration', label: 'Exp', type: 'string' },
            { key: 'volume_current', label: 'Volume', type: 'number', class: 'number' },
            { key: 'premium_notional', label: 'Notional', type: 'number', class: 'number' },
            { key: 'flags', label: 'Flags', type: 'none' }
        ]
    },

    /**
     * Get sort value for a row based on column type
     */
    getSortValue(row, column, suffix = '_hour') {
        const key = column.key;
        let value;

        switch (column.type) {
            case 'volChange':
                // Sort by percentage change
                value = row['volume_pct_change' + suffix];
                if (value === null || value === undefined) {
                    value = row.volume_pct_change;
                }
                return value ?? 0;

            case 'volume':
                return row.volume_today ?? row.volume_cumulative ?? 0;

            case 'notional':
                return (row.volume_today ?? row.volume_cumulative ?? 0) * (row.close_price ?? 0) * 100;

            case 'time':
                return row[key] ? new Date(row[key]).getTime() : 0;

            case 'date':
                return row[key] ? new Date(row[key]).getTime() : 0;

            case 'datetime':
                return row[key] ? new Date(row[key]).getTime() : 0;

            case 'number':
                value = row[key];
                return (value === null || value === undefined) ? -Infinity : value;

            case 'string':
                return row[key] || '';

            default:
                return row[key] ?? 0;
        }
    },

    /**
     * Sort rows by column
     */
    sortRows(rows, tableType, suffix = '_hour') {
        const state = this.sortState[tableType];
        if (!state.column) return rows;

        const column = this.columns[tableType].find(c => c.key === state.column);
        if (!column || column.type === 'none') return rows;

        const sorted = [...rows].sort((a, b) => {
            const aVal = this.getSortValue(a, column, suffix);
            const bVal = this.getSortValue(b, column, suffix);

            let comparison = 0;
            if (column.type === 'string') {
                comparison = String(aVal).localeCompare(String(bVal));
            } else {
                comparison = aVal - bVal;
            }

            return state.direction === 'asc' ? comparison : -comparison;
        });

        return sorted;
    },

    /**
     * Handle column header click for sorting
     */
    handleSort(tableType, columnKey) {
        const state = this.sortState[tableType];

        if (state.column === columnKey) {
            // Toggle direction
            state.direction = state.direction === 'asc' ? 'desc' : 'asc';
        } else {
            // New column, default to descending
            state.column = columnKey;
            state.direction = 'desc';
        }

        // Re-render the table
        this.reRenderTable(tableType);
    },

    /**
     * Re-render table after sort change
     */
    reRenderTable(tableType) {
        const container = document.querySelector(`.table-container[data-table-type="${tableType}"]`);
        if (!container) return;

        let html;
        switch (tableType) {
            case 'snapshot':
                html = this.renderSnapshot(this.currentData.snapshot, this.currentOptions.snapshot.showExpiration);
                break;
            case 'daily':
                html = this.renderDaily(this.currentData.daily);
                break;
            case 'alerts':
                html = this.renderAlerts(this.currentData.alerts);
                break;
        }

        if (html) {
            container.outerHTML = html;
            this.attachSortHandlers(tableType);
        }
    },

    /**
     * Attach click handlers to sortable headers
     */
    attachSortHandlers(tableType) {
        document.querySelectorAll(`th[data-sort]`).forEach(th => {
            th.addEventListener('click', () => {
                const columnKey = th.dataset.sort;
                this.handleSort(tableType, columnKey);
            });
        });
    },

    /**
     * Generate sortable header HTML
     */
    renderHeader(column, tableType, showExpiration = true) {
        if (column.conditional === 'showExpiration' && !showExpiration) {
            return '';
        }

        const state = this.sortState[tableType];
        const isSorted = state.column === column.key;
        const sortClass = isSorted ? ` sorted ${state.direction}` : '';
        const sortable = column.type !== 'none' ? ' sortable' : '';
        const dataSort = column.type !== 'none' ? ` data-sort="${column.key}"` : '';

        // Build class string properly
        let classes = [];
        if (column.class) classes.push(column.class);
        if (sortClass.trim()) classes.push(sortClass.trim());
        if (sortable.trim()) classes.push(sortable.trim());
        const finalClass = classes.length ? ` class="${classes.join(' ')}"` : '';

        return `<th${finalClass}${dataSort}>${column.label}${isSorted ? (state.direction === 'asc' ? ' ▲' : ' ▼') : ''}</th>`;
    },

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

        // Store data and options for re-sorting
        this.currentData.snapshot = rows;
        this.currentOptions.snapshot.showExpiration = showExpiration;

        const suffix = (typeof MoversComponent !== 'undefined')
            ? (MoversComponent.comparisonMode === 'hour' ? '_hour' : '_eod')
            : '_hour';

        // Apply sorting if active
        const sortedRows = this.sortRows(rows, 'snapshot', suffix);

        // Generate sortable headers
        const headers = this.columns.snapshot
            .map(col => this.renderHeader(col, 'snapshot', showExpiration))
            .join('');

        let html = `
            <div class="table-container" data-table-type="snapshot">
                <table>
                    <thead>
                        <tr>
                            ${headers}
                        </tr>
                    </thead>
                    <tbody>
        `;

        for (const row of sortedRows) {
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

        // Store data for re-sorting
        this.currentData.daily = rows;

        // Apply sorting if active
        const sortedRows = this.sortRows(rows, 'daily');

        // Generate sortable headers
        const headers = this.columns.daily
            .map(col => this.renderHeader(col, 'daily'))
            .join('');

        let html = `
            <div class="table-container" data-table-type="daily">
                <table>
                    <thead>
                        <tr>
                            ${headers}
                        </tr>
                    </thead>
                    <tbody>
        `;

        for (const row of sortedRows) {
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

        // Store data for re-sorting
        this.currentData.alerts = rows;

        // Apply sorting if active
        const sortedRows = this.sortRows(rows, 'alerts');

        // Generate sortable headers
        const headers = this.columns.alerts
            .map(col => this.renderHeader(col, 'alerts'))
            .join('');

        let html = `
            <div class="table-container" data-table-type="alerts">
                <table>
                    <thead>
                        <tr>
                            ${headers}
                        </tr>
                    </thead>
                    <tbody>
        `;

        for (const row of sortedRows) {
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
