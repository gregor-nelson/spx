// =============================================================================
// SPX Options Monitor - Greeks Component
// Renders the Greeks tab with IV smile, vol surface, and greeks table
// Depends on: config.js, utils.js
// =============================================================================

const GreeksComponent = {
    // =========================================================================
    // State
    // =========================================================================
    sortField: 'strike',
    sortAsc: true,
    volSurfaceMode: 'raw',  // 'raw' or 'zscore'

    // =========================================================================
    // Methods
    // =========================================================================

    /**
     * Sets the volatility surface display mode
     * @param {string} mode - 'raw' or 'zscore'
     */
    setVolSurfaceMode(mode) {
        this.volSurfaceMode = mode;

        // Update toggle buttons
        document.querySelectorAll('.surface-mode-toggle .toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        this.renderVolSurfaceChart();
    },

    /**
     * Sets the sort field for the greeks table
     * @param {string} field - Field name to sort by
     */
    setSort(field) {
        if (this.sortField === field) {
            this.sortAsc = !this.sortAsc;
        } else {
            this.sortField = field;
            this.sortAsc = field === 'strike'; // Default ascending for strike, descending for values
        }
        // Call global renderTab to re-render
        if (typeof renderTab === 'function') {
            renderTab();
        }
    },

    /**
     * Returns HTML structure for the Greeks tab
     * @returns {string} HTML string
     */
    render() {
        // Access data from global scope
        const enrichedData = (typeof data !== 'undefined' && data.enriched) ? data.enriched.data || [] : [];
        const meta = (typeof data !== 'undefined' && data.enriched) ? data.enriched.meta || {} : {};
        const expFilter = (typeof selectedExpiration !== 'undefined') ? selectedExpiration : '';

        if (!enrichedData.length) {
            return '<div class="loading">No Greeks data available</div>';
        }

        // Count unique expirations with IV data
        const expsWithIV = [...new Set(enrichedData.filter(r => r.implied_vol !== null).map(r => r.expiration))];

        return `
            <div class="meta-bar">
                <div class="meta-item">
                    <span class="meta-label">Last Update</span>
                    <span class="meta-value">${meta.captured_at ? meta.captured_at.substring(11, 16) : '-'}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Exp Filter</span>
                    <span class="meta-value">${expFilter || 'All'}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Contracts</span>
                    <span class="meta-value">${enrichedData.length}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Expirations</span>
                    <span class="meta-value">${expsWithIV.length}</span>
                </div>
            </div>

            <div class="greeks-chart-row">
                <div class="chart-container">
                    <div id="ivSmileChart" style="height: 320px;"></div>
                </div>
                <div class="chart-container">
                    <div class="chart-header">
                        <span class="chart-title">Volatility Surface</span>
                        <div class="surface-mode-toggle">
                            <button class="toggle-btn active" data-mode="raw" onclick="setVolSurfaceMode('raw')" title="Show raw implied volatility values">Raw IV</button>
                            <button class="toggle-btn" data-mode="zscore" onclick="setVolSurfaceMode('zscore')" title="Show Z-scores (standard deviations from mean) to highlight anomalies">Z-Score</button>
                        </div>
                    </div>
                    <div id="volSurfaceChart" style="height: 290px;"></div>
                </div>
            </div>

            <div class="greeks-chart-row">
                <div class="chart-container">
                    <div id="deltaByStrikeChart" style="height: 320px;"></div>
                </div>
                <div class="chart-container">
                    <div id="thetaByStrikeChart" style="height: 320px;"></div>
                </div>
            </div>

            <div class="greeks-chart-row">
                <div class="chart-container">
                    <div id="vegaByStrikeChart" style="height: 320px;"></div>
                </div>
                <div class="chart-container">
                    <div id="gammaByStrikeChart" style="height: 320px;"></div>
                </div>
            </div>

            ${this.renderTable(enrichedData)}
        `;
    },

    /**
     * Renders the greeks table
     * @param {Array} rows - Data rows
     * @returns {string} HTML string
     */
    renderTable(rows) {
        if (!rows.length) {
            return '<div class="loading">No data available</div>';
        }

        const formatMoney = Utils.formatMoney;
        const formatNumber = Utils.formatNumber;

        // Sort the data
        const sorted = [...rows].sort((a, b) => {
            let aVal = a[this.sortField];
            let bVal = b[this.sortField];

            // Handle null/undefined values
            if (aVal === null || aVal === undefined) aVal = this.sortAsc ? Infinity : -Infinity;
            if (bVal === null || bVal === undefined) bVal = this.sortAsc ? Infinity : -Infinity;

            if (this.sortAsc) {
                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            } else {
                return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
            }
        });

        const sortIcon = (field) => {
            if (this.sortField !== field) return '';
            return this.sortAsc ? ' ▲' : ' ▼';
        };

        const sortClass = (field) => {
            return this.sortField === field ? 'sort-active' : '';
        };

        let html = `
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th class="sortable ${sortClass('expiration')}" onclick="setGreeksSort('expiration')">Exp${sortIcon('expiration')}</th>
                            <th class="sortable ${sortClass('strike')}" onclick="setGreeksSort('strike')">Strike${sortIcon('strike')}</th>
                            <th class="sortable ${sortClass('dte')}" onclick="setGreeksSort('dte')">DTE${sortIcon('dte')}</th>
                            <th class="sortable number ${sortClass('close_price')}" onclick="setGreeksSort('close_price')">Price${sortIcon('close_price')}</th>
                            <th class="sortable number ${sortClass('delta')}" onclick="setGreeksSort('delta')">Delta${sortIcon('delta')}</th>
                            <th class="sortable number ${sortClass('gamma')}" onclick="setGreeksSort('gamma')">Gamma${sortIcon('gamma')}</th>
                            <th class="sortable number ${sortClass('theta')}" onclick="setGreeksSort('theta')">Theta${sortIcon('theta')}</th>
                            <th class="sortable number ${sortClass('vega')}" onclick="setGreeksSort('vega')">Vega${sortIcon('vega')}</th>
                            <th class="sortable number ${sortClass('implied_vol')}" onclick="setGreeksSort('implied_vol')">IV${sortIcon('implied_vol')}</th>
                            <th class="sortable number ${sortClass('volume_today')}" onclick="setGreeksSort('volume_today')">Vol${sortIcon('volume_today')}</th>
                            <th class="sortable number ${sortClass('open_interest')}" onclick="setGreeksSort('open_interest')">OI${sortIcon('open_interest')}</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        for (const row of sorted) {
            const deltaClass = row.delta !== null ? (row.delta > 0.5 ? 'positive' : row.delta < -0.5 ? 'negative' : '') : '';
            const thetaClass = row.theta !== null ? (row.theta < 0 ? 'negative' : '') : '';

            html += `
                <tr>
                    <td><span class="exp-badge">${row.expiration || '-'}</span></td>
                    <td>${row.strike}</td>
                    <td>${row.dte}</td>
                    <td class="number">${formatMoney(row.close_price)}</td>
                    <td class="number ${deltaClass}">${row.delta !== null ? row.delta.toFixed(4) : '-'}</td>
                    <td class="number">${row.gamma !== null ? row.gamma.toFixed(5) : '-'}</td>
                    <td class="number ${thetaClass}">${row.theta !== null ? row.theta.toFixed(4) : '-'}</td>
                    <td class="number">${row.vega !== null ? row.vega.toFixed(4) : '-'}</td>
                    <td class="number">${row.implied_vol !== null ? (row.implied_vol * 100).toFixed(1) + '%' : '-'}</td>
                    <td class="number">${formatNumber(row.volume_today)}</td>
                    <td class="number">${formatNumber(row.open_interest)}</td>
                </tr>
            `;
        }

        html += '</tbody></table></div>';
        return html;
    },

    /**
     * Renders all Greeks charts (IV smile, vol surface, delta/theta/vega/gamma by strike)
     */
    renderCharts() {
        this.renderIVSmileChart();
        this.renderVolSurfaceChart();
        this.renderDeltaByStrikeChart();
        this.renderThetaByStrikeChart();
        this.renderVegaByStrikeChart();
        this.renderGammaByStrikeChart();
    },

    /**
     * Renders the IV smile chart
     */
    renderIVSmileChart() {
        const theme = Config.theme;
        const plotlyLayout = Config.plotlyLayout;
        const plotlyConfig = Config.plotlyConfig;
        const formatShortDate = Utils.formatShortDate;

        const enrichedData = (typeof data !== 'undefined' && data.enriched) ? data.enriched.data || [] : [];
        const expFilter = (typeof selectedExpiration !== 'undefined') ? selectedExpiration : '';

        if (!enrichedData.length) {
            document.getElementById('ivSmileChart').innerHTML = '<div class="loading">No data available</div>';
            return;
        }

        // Get unique expirations
        const expirations = [...new Set(enrichedData.map(r => r.expiration))].sort();

        // If filtering by expiration, only show that one
        const expsToShow = expFilter ? [expFilter] : expirations.slice(0, 4);

        // IBKR-style muted colors for multiple expirations
        const expColors = [
            theme.primary,          // Red for nearest expiry
            theme.info,             // Blue
            theme.accentPurple,     // Purple
            theme.success           // Green
        ];

        const traces = [];

        for (let i = 0; i < expsToShow.length; i++) {
            const exp = expsToShow[i];
            const expData = enrichedData
                .filter(r => r.expiration === exp && r.implied_vol !== null)
                .sort((a, b) => a.strike - b.strike);

            if (expData.length < 2) continue;

            const strikes = expData.map(r => r.strike);
            const ivs = expData.map(r => (r.implied_vol * 100));
            const dte = expData[0]?.dte || '?';

            traces.push({
                x: strikes,
                y: ivs,
                type: 'scatter',
                mode: 'lines+markers',
                name: `${formatShortDate(exp)} (${dte}d)`,
                line: {
                    color: expColors[i % expColors.length],
                    width: 2,
                    shape: 'spline',
                    smoothing: 0.8
                },
                marker: {
                    color: expColors[i % expColors.length],
                    size: 5,
                    line: { color: theme.bgSecondary, width: 1 }
                },
                hovertemplate: `<b>Strike: %{x}</b><br>IV: %{y:.1f}%<br>${formatShortDate(exp)}<extra></extra>`,
                hoverlabel: {
                    bgcolor: theme.neutral5,
                    bordercolor: theme.neutral30,
                    font: { family: "'Source Sans Pro', Arial", size: 12, color: theme.fontColor }
                }
            });
        }

        if (!traces.length) {
            document.getElementById('ivSmileChart').innerHTML = '<div class="loading">No IV data available</div>';
            return;
        }

        // Get spot price for ATM reference
        const spotPrice = (typeof data !== 'undefined' && data.enriched) ? data.enriched.meta?.spot_price : null;

        // ATM reference line
        const atmShapes = spotPrice ? [{
            type: 'line',
            x0: spotPrice,
            x1: spotPrice,
            y0: 0,
            y1: 1,
            yref: 'paper',
            line: {
                color: theme.textMuted,
                width: 1,
                dash: 'dot'
            }
        }] : [];

        const atmAnnotations = spotPrice ? [{
            x: spotPrice,
            y: 1,
            yref: 'paper',
            text: `ATM ${spotPrice?.toLocaleString() || ''}`,
            showarrow: false,
            font: {
                family: "'Source Sans Pro', Arial",
                size: 10,
                color: theme.textMuted
            },
            yanchor: 'bottom',
            yshift: 4
        }] : [];

        Plotly.newPlot('ivSmileChart', traces, {
            ...plotlyLayout,
            title: {
                text: 'IV Smile by Expiration',
                font: { size: 13, color: theme.textSecondary },
                x: 0,
                xanchor: 'left'
            },
            xaxis: {
                ...plotlyLayout.xaxis,
                title: null
            },
            yaxis: {
                ...plotlyLayout.yaxis,
                title: { text: 'IV (%)', font: { size: 11, color: theme.textMuted }, standoff: 6 }
            },
            legend: {
                ...plotlyLayout.legend,
                y: -0.18
            },
            shapes: atmShapes,
            annotations: atmAnnotations,
            margin: { t: 32, r: 12, b: 55, l: 48 }
        }, {
            ...plotlyConfig,
            displayModeBar: true,
            modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
            displaylogo: false
        });
    },

    /**
     * Renders the volatility surface 3D chart
     */
    renderVolSurfaceChart() {
        const theme = Config.theme;
        const formatShortDate = Utils.formatShortDate;

        const enrichedData = (typeof data !== 'undefined' && data.enriched) ? data.enriched.data || [] : [];

        if (!enrichedData.length) {
            document.getElementById('volSurfaceChart').innerHTML = '<div class="loading">No data available</div>';
            return;
        }

        // Filter to data with IV values
        const ivData = enrichedData.filter(r => r.implied_vol !== null);

        if (ivData.length < 3) {
            document.getElementById('volSurfaceChart').innerHTML = '<div class="loading">Insufficient IV data for surface</div>';
            return;
        }

        // Get unique sorted strikes and expirations (by DTE)
        const strikes = [...new Set(ivData.map(r => r.strike))].sort((a, b) => a - b);
        const expirations = [...new Set(ivData.map(r => r.expiration))].sort();

        // Build a map for quick lookup: expiration -> strike -> iv (as percentage)
        const ivMap = {};
        const allIVs = []; // Collect all IV values for stats
        for (const row of ivData) {
            if (!ivMap[row.expiration]) ivMap[row.expiration] = {};
            const ivPct = row.implied_vol * 100;
            ivMap[row.expiration][row.strike] = ivPct;
            allIVs.push(ivPct);
        }

        // Calculate mean and standard deviation for Z-score mode
        const mean = allIVs.reduce((a, b) => a + b, 0) / allIVs.length;
        const variance = allIVs.reduce((sum, iv) => sum + Math.pow(iv - mean, 2), 0) / allIVs.length;
        const stdDev = Math.sqrt(variance);

        // Get DTE for each expiration for Y-axis
        const dteMap = {};
        for (const row of ivData) {
            dteMap[row.expiration] = row.dte;
        }

        // Build Z matrix (rows = expirations, cols = strikes)
        // Use null for missing data points (Plotly will leave gaps)
        const z = [];
        const zRaw = []; // Keep raw values for hover text
        const y = []; // DTE values
        const yLabels = []; // Expiration labels for hover

        for (const exp of expirations) {
            const row = [];
            const rowRaw = [];
            for (const strike of strikes) {
                const iv = ivMap[exp]?.[strike];
                if (iv !== undefined) {
                    rowRaw.push(iv);
                    if (this.volSurfaceMode === 'zscore') {
                        // Transform to Z-score
                        row.push((iv - mean) / stdDev);
                    } else {
                        row.push(iv);
                    }
                } else {
                    row.push(null);
                    rowRaw.push(null);
                }
            }
            z.push(row);
            zRaw.push(rowRaw);
            y.push(dteMap[exp]);
            yLabels.push(exp);
        }

        // Create custom hover text
        const hoverText = z.map((row, i) =>
            row.map((val, j) => {
                if (val === null) return '';
                const rawIV = zRaw[i][j];
                if (this.volSurfaceMode === 'zscore') {
                    const zScore = val;
                    const anomalyLabel = Math.abs(zScore) >= 2 ? ' ANOMALY' : '';
                    return `Strike: ${strikes[j]}<br>DTE: ${y[i]}d (${formatShortDate(yLabels[i])})<br>IV: ${rawIV.toFixed(1)}%<br>Z-Score: ${zScore >= 0 ? '+' : ''}${zScore.toFixed(2)}σ${anomalyLabel}`;
                } else {
                    return `Strike: ${strikes[j]}<br>DTE: ${y[i]}d (${formatShortDate(yLabels[i])})<br>IV: ${rawIV.toFixed(1)}%`;
                }
            })
        );

        // Colorscales for different modes
        const rawColorscale = [
            [0, '#1e3a5f'],           // Low IV - deep blue
            [0.2, '#2563a8'],         // Blue
            [0.4, theme.info],        // Info blue
            [0.5, '#4a8a6a'],         // Teal transition
            [0.6, theme.success],     // Green
            [0.75, theme.warning],    // Amber
            [0.9, '#c45a28'],         // Orange
            [1, theme.primary]        // High IV - red
        ];

        // Diverging colorscale for Z-score: blue (cheap) -> gray (normal) -> red (expensive)
        const zscoreColorscale = [
            [0, '#1e5a9e'],           // Very cheap (-3σ) - deep blue
            [0.17, '#3b82c4'],        // -2σ - blue
            [0.33, '#6a9bc4'],        // -1σ - light blue
            [0.5, theme.neutral30],   // 0σ - neutral gray
            [0.67, '#c49a6a'],        // +1σ - light amber
            [0.83, '#c45a28'],        // +2σ - orange
            [1, '#b33a3a']            // Very expensive (+3σ) - red
        ];

        const colorscale = this.volSurfaceMode === 'zscore' ? zscoreColorscale : rawColorscale;

        // For Z-score mode, center the color scale at 0 and cap at ±3σ
        const zMin = this.volSurfaceMode === 'zscore' ? -3 : undefined;
        const zMax = this.volSurfaceMode === 'zscore' ? 3 : undefined;
        const zMid = this.volSurfaceMode === 'zscore' ? 0 : undefined;

        // Colorbar config based on mode
        const colorbarConfig = this.volSurfaceMode === 'zscore' ? {
            title: {
                text: 'Z-Score (σ)',
                font: { family: "'Source Sans Pro', Arial", size: 10, color: theme.textMuted },
                side: 'right'
            },
            tickfont: { family: "'Source Sans Pro', Arial", size: 9, color: theme.textMuted },
            len: 0.6,
            thickness: 12,
            xpad: 8,
            ticksuffix: 'σ',
            outlinecolor: theme.border,
            outlinewidth: 1
        } : {
            title: {
                text: 'IV %',
                font: { family: "'Source Sans Pro', Arial", size: 10, color: theme.textMuted },
                side: 'right'
            },
            tickfont: { family: "'Source Sans Pro', Arial", size: 9, color: theme.textMuted },
            len: 0.6,
            thickness: 12,
            xpad: 8,
            ticksuffix: '%',
            outlinecolor: theme.border,
            outlinewidth: 1
        };

        // Z-axis label based on mode
        const zAxisTitle = this.volSurfaceMode === 'zscore' ? 'Z-Score (σ)' : 'IV %';

        // Adjust aspect ratio for Z-score mode to amplify peaks/troughs
        const aspectRatio = this.volSurfaceMode === 'zscore'
            ? { x: 1.2, y: 1, z: 1.0 }  // Taller Z for Z-score
            : { x: 1.2, y: 1, z: 0.7 };  // Flatter for raw

        Plotly.newPlot('volSurfaceChart', [{
            type: 'surface',
            x: strikes,
            y: y,
            z: z,
            colorscale: colorscale,
            cmin: zMin,
            cmax: zMax,
            cmid: zMid,
            hoverinfo: 'text',
            text: hoverText,
            hoverlabel: {
                bgcolor: theme.neutral5,
                bordercolor: theme.neutral30,
                font: { family: "'Source Sans Pro', Arial", size: 12, color: theme.fontColor }
            },
            contours: {
                z: {
                    show: true,
                    usecolormap: true,
                    highlightcolor: theme.fontColorDark,
                    project: { z: false }
                }
            },
            colorbar: colorbarConfig,
            lighting: {
                ambient: 0.8,
                diffuse: 0.5,
                specular: 0.2,
                roughness: 0.5
            },
            connectgaps: false  // Don't interpolate missing data
        }], {
            paper_bgcolor: theme.bgSecondary,
            plot_bgcolor: theme.bgSecondary,
            font: {
                color: theme.fontColor,
                family: "'Source Sans Pro', Arial",
                size: 10
            },
            scene: {
                xaxis: {
                    title: { text: 'Strike', font: { size: 10, color: theme.textMuted } },
                    gridcolor: theme.neutral20,
                    showbackground: true,
                    backgroundcolor: theme.bgDarkest,
                    tickfont: { size: 9, color: theme.textMuted }
                },
                yaxis: {
                    title: { text: 'DTE', font: { size: 10, color: theme.textMuted } },
                    gridcolor: theme.neutral20,
                    showbackground: true,
                    backgroundcolor: theme.bgDarkest,
                    tickfont: { size: 9, color: theme.textMuted }
                },
                zaxis: {
                    title: { text: zAxisTitle, font: { size: 10, color: theme.textMuted } },
                    gridcolor: theme.neutral20,
                    showbackground: true,
                    backgroundcolor: theme.bgDarkest,
                    tickfont: { size: 9, color: theme.textMuted }
                },
                camera: {
                    eye: { x: 1.5, y: -1.5, z: 0.8 },
                    center: { x: 0, y: 0, z: -0.1 }
                },
                aspectmode: 'manual',
                aspectratio: aspectRatio
            },
            margin: { t: 10, r: 10, b: 10, l: 10 }
        }, {
            responsive: true,
            displayModeBar: true,
            modeBarButtonsToRemove: ['toImage', 'sendDataToCloud'],
            displaylogo: false
        });
    },

    /**
     * Renders the Delta by Strike chart
     * Shows delta values across strikes for each expiration (similar to IV smile)
     */
    renderDeltaByStrikeChart() {
        const theme = Config.theme;
        const plotlyLayout = Config.plotlyLayout;
        const plotlyConfig = Config.plotlyConfig;
        const formatShortDate = Utils.formatShortDate;

        const enrichedData = (typeof data !== 'undefined' && data.enriched) ? data.enriched.data || [] : [];
        const expFilter = (typeof selectedExpiration !== 'undefined') ? selectedExpiration : '';

        const chartEl = document.getElementById('deltaByStrikeChart');
        if (!chartEl) return;

        if (!enrichedData.length) {
            chartEl.innerHTML = '<div class="loading">No data available</div>';
            return;
        }

        // Get unique expirations
        const expirations = [...new Set(enrichedData.map(r => r.expiration))].sort();

        // If filtering by expiration, only show that one
        const expsToShow = expFilter ? [expFilter] : expirations.slice(0, 4);

        // Delta chart colors - Blue/Cyan palette
        const expColors = [
            '#3b82f6',    // Blue
            '#06b6d4',    // Cyan
            '#0ea5e9',    // Sky blue
            '#6366f1'     // Indigo
        ];

        const traces = [];

        for (let i = 0; i < expsToShow.length; i++) {
            const exp = expsToShow[i];
            const expData = enrichedData
                .filter(r => r.expiration === exp && r.delta !== null)
                .sort((a, b) => a.strike - b.strike);

            if (expData.length < 2) continue;

            const strikes = expData.map(r => r.strike);
            const deltas = expData.map(r => r.delta);
            const dte = expData[0]?.dte || '?';

            traces.push({
                x: strikes,
                y: deltas,
                type: 'scatter',
                mode: 'lines+markers',
                name: `${formatShortDate(exp)} (${dte}d)`,
                line: {
                    color: expColors[i % expColors.length],
                    width: 2,
                    shape: 'spline',
                    smoothing: 0.8
                },
                marker: {
                    color: expColors[i % expColors.length],
                    size: 5,
                    line: { color: theme.bgSecondary, width: 1 }
                },
                hovertemplate: `<b>Strike: %{x}</b><br>Delta: %{y:.4f}<br>${formatShortDate(exp)}<extra></extra>`,
                hoverlabel: {
                    bgcolor: theme.neutral5,
                    bordercolor: theme.neutral30,
                    font: { family: "'Source Sans Pro', Arial", size: 12, color: theme.fontColor }
                }
            });
        }

        if (!traces.length) {
            chartEl.innerHTML = '<div class="loading">No delta data available</div>';
            return;
        }

        // Get spot price for ATM reference
        const spotPrice = (typeof data !== 'undefined' && data.enriched) ? data.enriched.meta?.spot_price : null;

        // ATM reference line
        const atmShapes = spotPrice ? [{
            type: 'line',
            x0: spotPrice,
            x1: spotPrice,
            y0: 0,
            y1: 1,
            yref: 'paper',
            line: {
                color: theme.textMuted,
                width: 1,
                dash: 'dot'
            }
        }] : [];


        const atmAnnotations = spotPrice ? [{
            x: spotPrice,
            y: 1,
            yref: 'paper',
            text: `ATM ${spotPrice?.toLocaleString() || ''}`,
            showarrow: false,
            font: {
                family: "'Source Sans Pro', Arial",
                size: 10,
                color: theme.textMuted
            },
            yanchor: 'bottom',
            yshift: 4
        }] : [];

        Plotly.newPlot('deltaByStrikeChart', traces, {
            ...plotlyLayout,
            title: {
                text: 'Delta by Strike',
                font: { size: 13, color: theme.textSecondary },
                x: 0,
                xanchor: 'left'
            },
            xaxis: {
                ...plotlyLayout.xaxis,
                title: null
            },
            yaxis: {
                ...plotlyLayout.yaxis,
                title: { text: 'Delta', font: { size: 11, color: theme.textMuted }, standoff: 6 },
                range: [-0.22, 0.01]  // Range for OTM puts up to ~0.2 delta
            },
            legend: {
                ...plotlyLayout.legend,
                y: -0.18
            },
            shapes: atmShapes,
            annotations: atmAnnotations,
            margin: { t: 32, r: 12, b: 55, l: 48 }
        }, {
            ...plotlyConfig,
            displayModeBar: true,
            modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
            displaylogo: false
        });
    },

    /**
     * Renders the Theta by Strike chart
     * Shows theta values across strikes for each expiration
     */
    renderThetaByStrikeChart() {
        const theme = Config.theme;
        const plotlyLayout = Config.plotlyLayout;
        const plotlyConfig = Config.plotlyConfig;
        const formatShortDate = Utils.formatShortDate;

        const enrichedData = (typeof data !== 'undefined' && data.enriched) ? data.enriched.data || [] : [];
        const expFilter = (typeof selectedExpiration !== 'undefined') ? selectedExpiration : '';

        const chartEl = document.getElementById('thetaByStrikeChart');
        if (!chartEl) return;

        if (!enrichedData.length) {
            chartEl.innerHTML = '<div class="loading">No data available</div>';
            return;
        }

        const expirations = [...new Set(enrichedData.map(r => r.expiration))].sort();
        const expsToShow = expFilter ? [expFilter] : expirations.slice(0, 4);

        // Theta chart colors - Red/Orange palette (decay theme)
        const expColors = [
            '#ef4444',    // Red
            '#f97316',    // Orange
            '#f59e0b',    // Amber
            '#dc2626'     // Dark red
        ];

        const traces = [];

        for (let i = 0; i < expsToShow.length; i++) {
            const exp = expsToShow[i];
            const expData = enrichedData
                .filter(r => r.expiration === exp && r.theta !== null)
                .sort((a, b) => a.strike - b.strike);

            if (expData.length < 2) continue;

            const strikes = expData.map(r => r.strike);
            const thetas = expData.map(r => r.theta);
            const dte = expData[0]?.dte || '?';

            traces.push({
                x: strikes,
                y: thetas,
                type: 'scatter',
                mode: 'lines+markers',
                name: `${formatShortDate(exp)} (${dte}d)`,
                line: {
                    color: expColors[i % expColors.length],
                    width: 2,
                    shape: 'spline',
                    smoothing: 0.8
                },
                marker: {
                    color: expColors[i % expColors.length],
                    size: 5,
                    line: { color: theme.bgSecondary, width: 1 }
                },
                hovertemplate: `<b>Strike: %{x}</b><br>Theta: %{y:.4f}<br>${formatShortDate(exp)}<extra></extra>`,
                hoverlabel: {
                    bgcolor: theme.neutral5,
                    bordercolor: theme.neutral30,
                    font: { family: "'Source Sans Pro', Arial", size: 12, color: theme.fontColor }
                }
            });
        }

        if (!traces.length) {
            chartEl.innerHTML = '<div class="loading">No theta data available</div>';
            return;
        }

        const spotPrice = (typeof data !== 'undefined' && data.enriched) ? data.enriched.meta?.spot_price : null;

        const atmShapes = spotPrice ? [{
            type: 'line',
            x0: spotPrice,
            x1: spotPrice,
            y0: 0,
            y1: 1,
            yref: 'paper',
            line: {
                color: theme.textMuted,
                width: 1,
                dash: 'dot'
            }
        }] : [];

        Plotly.newPlot('thetaByStrikeChart', traces, {
            ...plotlyLayout,
            title: {
                text: 'Theta by Strike',
                font: { size: 13, color: theme.textSecondary },
                x: 0,
                xanchor: 'left'
            },
            xaxis: {
                ...plotlyLayout.xaxis,
                title: null
            },
            yaxis: {
                ...plotlyLayout.yaxis,
                title: { text: 'Theta (θ)', font: { size: 11, color: theme.textMuted }, standoff: 6 },
                autorange: true
            },
            legend: {
                ...plotlyLayout.legend,
                y: -0.18
            },
            shapes: atmShapes,
            margin: { t: 32, r: 12, b: 55, l: 48 }
        }, {
            ...plotlyConfig,
            displayModeBar: true,
            modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
            displaylogo: false
        });
    },

    /**
     * Renders the Vega by Strike chart
     * Shows vega values across strikes for each expiration
     */
    renderVegaByStrikeChart() {
        const theme = Config.theme;
        const plotlyLayout = Config.plotlyLayout;
        const plotlyConfig = Config.plotlyConfig;
        const formatShortDate = Utils.formatShortDate;

        const enrichedData = (typeof data !== 'undefined' && data.enriched) ? data.enriched.data || [] : [];
        const expFilter = (typeof selectedExpiration !== 'undefined') ? selectedExpiration : '';

        const chartEl = document.getElementById('vegaByStrikeChart');
        if (!chartEl) return;

        if (!enrichedData.length) {
            chartEl.innerHTML = '<div class="loading">No data available</div>';
            return;
        }

        const expirations = [...new Set(enrichedData.map(r => r.expiration))].sort();
        const expsToShow = expFilter ? [expFilter] : expirations.slice(0, 4);

        // Vega chart colors - Green/Teal palette
        const expColors = [
            '#10b981',    // Emerald
            '#14b8a6',    // Teal
            '#22c55e',    // Green
            '#059669'     // Dark emerald
        ];

        const traces = [];

        for (let i = 0; i < expsToShow.length; i++) {
            const exp = expsToShow[i];
            const expData = enrichedData
                .filter(r => r.expiration === exp && r.vega !== null)
                .sort((a, b) => a.strike - b.strike);

            if (expData.length < 2) continue;

            const strikes = expData.map(r => r.strike);
            const vegas = expData.map(r => r.vega);
            const dte = expData[0]?.dte || '?';

            traces.push({
                x: strikes,
                y: vegas,
                type: 'scatter',
                mode: 'lines+markers',
                name: `${formatShortDate(exp)} (${dte}d)`,
                line: {
                    color: expColors[i % expColors.length],
                    width: 2,
                    shape: 'spline',
                    smoothing: 0.8
                },
                marker: {
                    color: expColors[i % expColors.length],
                    size: 5,
                    line: { color: theme.bgSecondary, width: 1 }
                },
                hovertemplate: `<b>Strike: %{x}</b><br>Vega: %{y:.4f}<br>${formatShortDate(exp)}<extra></extra>`,
                hoverlabel: {
                    bgcolor: theme.neutral5,
                    bordercolor: theme.neutral30,
                    font: { family: "'Source Sans Pro', Arial", size: 12, color: theme.fontColor }
                }
            });
        }

        if (!traces.length) {
            chartEl.innerHTML = '<div class="loading">No vega data available</div>';
            return;
        }

        const spotPrice = (typeof data !== 'undefined' && data.enriched) ? data.enriched.meta?.spot_price : null;

        const atmShapes = spotPrice ? [{
            type: 'line',
            x0: spotPrice,
            x1: spotPrice,
            y0: 0,
            y1: 1,
            yref: 'paper',
            line: {
                color: theme.textMuted,
                width: 1,
                dash: 'dot'
            }
        }] : [];

        Plotly.newPlot('vegaByStrikeChart', traces, {
            ...plotlyLayout,
            title: {
                text: 'Vega by Strike',
                font: { size: 13, color: theme.textSecondary },
                x: 0,
                xanchor: 'left'
            },
            xaxis: {
                ...plotlyLayout.xaxis,
                title: null
            },
            yaxis: {
                ...plotlyLayout.yaxis,
                title: { text: 'Vega (ν)', font: { size: 11, color: theme.textMuted }, standoff: 6 },
                autorange: true
            },
            legend: {
                ...plotlyLayout.legend,
                y: -0.18
            },
            shapes: atmShapes,
            margin: { t: 32, r: 12, b: 55, l: 48 }
        }, {
            ...plotlyConfig,
            displayModeBar: true,
            modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
            displaylogo: false
        });
    },

    /**
     * Renders the Gamma by Strike chart
     * Shows gamma values across strikes for each expiration
     */
    renderGammaByStrikeChart() {
        const theme = Config.theme;
        const plotlyLayout = Config.plotlyLayout;
        const plotlyConfig = Config.plotlyConfig;
        const formatShortDate = Utils.formatShortDate;

        const enrichedData = (typeof data !== 'undefined' && data.enriched) ? data.enriched.data || [] : [];
        const expFilter = (typeof selectedExpiration !== 'undefined') ? selectedExpiration : '';

        const chartEl = document.getElementById('gammaByStrikeChart');
        if (!chartEl) return;

        if (!enrichedData.length) {
            chartEl.innerHTML = '<div class="loading">No data available</div>';
            return;
        }

        const expirations = [...new Set(enrichedData.map(r => r.expiration))].sort();
        const expsToShow = expFilter ? [expFilter] : expirations.slice(0, 4);

        // Gamma chart colors - Purple/Pink palette
        const expColors = [
            '#a855f7',    // Purple
            '#d946ef',    // Fuchsia
            '#8b5cf6',    // Violet
            '#ec4899'     // Pink
        ];

        const traces = [];

        for (let i = 0; i < expsToShow.length; i++) {
            const exp = expsToShow[i];
            const expData = enrichedData
                .filter(r => r.expiration === exp && r.gamma !== null)
                .sort((a, b) => a.strike - b.strike);

            if (expData.length < 2) continue;

            const strikes = expData.map(r => r.strike);
            const gammas = expData.map(r => r.gamma);
            const dte = expData[0]?.dte || '?';

            traces.push({
                x: strikes,
                y: gammas,
                type: 'scatter',
                mode: 'lines+markers',
                name: `${formatShortDate(exp)} (${dte}d)`,
                line: {
                    color: expColors[i % expColors.length],
                    width: 2,
                    shape: 'spline',
                    smoothing: 0.8
                },
                marker: {
                    color: expColors[i % expColors.length],
                    size: 5,
                    line: { color: theme.bgSecondary, width: 1 }
                },
                hovertemplate: `<b>Strike: %{x}</b><br>Gamma: %{y:.5f}<br>${formatShortDate(exp)}<extra></extra>`,
                hoverlabel: {
                    bgcolor: theme.neutral5,
                    bordercolor: theme.neutral30,
                    font: { family: "'Source Sans Pro', Arial", size: 12, color: theme.fontColor }
                }
            });
        }

        if (!traces.length) {
            chartEl.innerHTML = '<div class="loading">No gamma data available</div>';
            return;
        }

        const spotPrice = (typeof data !== 'undefined' && data.enriched) ? data.enriched.meta?.spot_price : null;

        const atmShapes = spotPrice ? [{
            type: 'line',
            x0: spotPrice,
            x1: spotPrice,
            y0: 0,
            y1: 1,
            yref: 'paper',
            line: {
                color: theme.textMuted,
                width: 1,
                dash: 'dot'
            }
        }] : [];

        Plotly.newPlot('gammaByStrikeChart', traces, {
            ...plotlyLayout,
            title: {
                text: 'Gamma by Strike',
                font: { size: 13, color: theme.textSecondary },
                x: 0,
                xanchor: 'left'
            },
            xaxis: {
                ...plotlyLayout.xaxis,
                title: null
            },
            yaxis: {
                ...plotlyLayout.yaxis,
                title: { text: 'Gamma (γ)', font: { size: 11, color: theme.textMuted }, standoff: 6 },
                autorange: true
            },
            legend: {
                ...plotlyLayout.legend,
                y: -0.18
            },
            shapes: atmShapes,
            margin: { t: 32, r: 12, b: 55, l: 48 }
        }, {
            ...plotlyConfig,
            displayModeBar: true,
            modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
            displaylogo: false
        });
    }
};

// =============================================================================
// Backward Compatibility - Global function aliases
// =============================================================================
function setVolSurfaceMode(mode) {
    GreeksComponent.setVolSurfaceMode(mode);
}

function setGreeksSort(field) {
    GreeksComponent.setSort(field);
}

function renderGreeksTab() {
    return GreeksComponent.render();
}

function renderGreeksTable(rows) {
    return GreeksComponent.renderTable(rows);
}

function renderGreeksCharts() {
    GreeksComponent.renderCharts();
}

function renderIVSmileChart() {
    GreeksComponent.renderIVSmileChart();
}

function renderVolSurfaceChart() {
    GreeksComponent.renderVolSurfaceChart();
}

function renderDeltaByStrikeChart() {
    GreeksComponent.renderDeltaByStrikeChart();
}

function renderThetaByStrikeChart() {
    GreeksComponent.renderThetaByStrikeChart();
}

function renderVegaByStrikeChart() {
    GreeksComponent.renderVegaByStrikeChart();
}

function renderGammaByStrikeChart() {
    GreeksComponent.renderGammaByStrikeChart();
}
