// =============================================================================
// SPX Options Monitor - Greeks Component (ECharts/ECharts-GL)
// Renders the Greeks tab with IV smile, vol surface, and greeks charts
// =============================================================================

const GreeksComponent = {
    // Chart instances
    charts: {},

    // State
    sortField: 'strike',
    sortAsc: true,
    volSurfaceMode: 'raw',  // 'raw' or 'zscore'

    /**
     * Sets the volatility surface display mode
     */
    setVolSurfaceMode(mode) {
        this.volSurfaceMode = mode;

        document.querySelectorAll('.surface-mode-toggle .toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        this.renderVolSurfaceChart();
    },

    /**
     * Sets the sort field for the greeks table
     */
    setSort(field) {
        if (this.sortField === field) {
            this.sortAsc = !this.sortAsc;
        } else {
            this.sortField = field;
            this.sortAsc = field === 'strike';
        }
        if (typeof renderTab === 'function') {
            renderTab();
        }
    },

    /**
     * Returns HTML structure for the Greeks tab
     */
    render() {
        const enrichedData = (typeof data !== 'undefined' && data.enriched) ? data.enriched.data || [] : [];
        const meta = (typeof data !== 'undefined' && data.enriched) ? data.enriched.meta || {} : {};
        const expFilter = (typeof selectedExpiration !== 'undefined') ? selectedExpiration : '';

        if (!enrichedData.length) {
            return '<div class="content-loading">No Greeks data available</div>';
        }

        const expsWithIV = [...new Set(enrichedData.filter(r => r.implied_vol !== null).map(r => r.expiration))];

        return `
            <div class="meta-bar">
                <div class="meta-item">
                    <span class="meta-label">Last Update</span>
                    <span class="meta-value">${meta.captured_at ? Utils.formatTime(meta.captured_at) : '-'}</span>
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

            <div class="chart-container chart-full">
                <div id="ivSmileChart" class="chart-wrapper" style="height: 350px;"></div>
            </div>
            <div class="chart-container chart-full">
                <div class="chart-header">
                    <span class="chart-title">Volatility Surface</span>
                    <div class="surface-mode-toggle panel-toggles">
                        <button class="toggle-btn active" data-mode="raw" onclick="setVolSurfaceMode('raw')" title="Raw implied volatility">Raw IV</button>
                        <button class="toggle-btn" data-mode="zscore" onclick="setVolSurfaceMode('zscore')" title="Z-score (standard deviations)">Z-Score</button>
                    </div>
                </div>
                <div id="volSurfaceChart" class="chart-wrapper" style="height: 350px;"></div>
            </div>
            <div class="chart-container chart-full">
                <div id="deltaByStrikeChart" class="chart-wrapper" style="height: 350px;"></div>
            </div>
            <div class="chart-container chart-full">
                <div id="thetaByStrikeChart" class="chart-wrapper" style="height: 350px;"></div>
            </div>
            <div class="chart-container chart-full">
                <div id="vegaByStrikeChart" class="chart-wrapper" style="height: 350px;"></div>
            </div>
            <div class="chart-container chart-full">
                <div id="gammaByStrikeChart" class="chart-wrapper" style="height: 350px;"></div>
            </div>

            ${this.renderTable(enrichedData)}
        `;
    },

    /**
     * Renders the greeks table
     */
    renderTable(rows) {
        if (!rows.length) {
            return '<div class="content-loading">No data available</div>';
        }

        const sorted = [...rows].sort((a, b) => {
            let aVal = a[this.sortField];
            let bVal = b[this.sortField];

            if (aVal === null || aVal === undefined) aVal = this.sortAsc ? Infinity : -Infinity;
            if (bVal === null || bVal === undefined) bVal = this.sortAsc ? Infinity : -Infinity;

            if (this.sortAsc) {
                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            } else {
                return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
            }
        });

        const sortIcon = (field) => this.sortField !== field ? '' : (this.sortAsc ? ' &#9650;' : ' &#9660;');
        const sortClass = (field) => this.sortField === field ? 'sort-active' : '';

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
                    <td class="number">${Utils.formatMoney(row.close_price)}</td>
                    <td class="number ${deltaClass}">${row.delta !== null ? row.delta.toFixed(4) : '-'}</td>
                    <td class="number">${row.gamma !== null ? row.gamma.toFixed(5) : '-'}</td>
                    <td class="number ${thetaClass}">${row.theta !== null ? row.theta.toFixed(4) : '-'}</td>
                    <td class="number">${row.vega !== null ? row.vega.toFixed(4) : '-'}</td>
                    <td class="number">${row.implied_vol !== null ? (row.implied_vol * 100).toFixed(1) + '%' : '-'}</td>
                    <td class="number">${Utils.formatNumber(row.volume_today)}</td>
                    <td class="number">${Utils.formatNumber(row.open_interest)}</td>
                </tr>
            `;
        }

        html += '</tbody></table></div>';
        return html;
    },

    /**
     * Initialize or get chart instance
     */
    getChart(id) {
        const container = document.getElementById(id);
        if (!container) return null;

        if (this.charts[id]) {
            this.charts[id].dispose();
        }
        this.charts[id] = echarts.init(container);
        return this.charts[id];
    },

    /**
     * Renders all Greeks charts
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
        const chart = this.getChart('ivSmileChart');
        if (!chart) return;

        const enrichedData = (typeof data !== 'undefined' && data.enriched) ? data.enriched.data || [] : [];
        const expFilter = (typeof selectedExpiration !== 'undefined') ? selectedExpiration : '';

        if (!enrichedData.length) return;

        const expirations = [...new Set(enrichedData.map(r => r.expiration))].sort();
        const expsToShow = expFilter ? [expFilter] : expirations.slice(0, 4);

        const expColors = [
            Config.theme.negative,
            Config.theme.accent,
            Config.theme.accentPurple,
            Config.theme.positive
        ];

        const series = [];
        const legendData = [];

        for (let i = 0; i < expsToShow.length; i++) {
            const exp = expsToShow[i];
            const expData = enrichedData
                .filter(r => r.expiration === exp && r.implied_vol !== null)
                .sort((a, b) => a.strike - b.strike);

            if (expData.length < 2) continue;

            const strikes = expData.map(r => r.strike);
            const ivs = expData.map(r => (r.implied_vol * 100));
            const dte = expData[0]?.dte || '?';
            const name = `${Utils.formatShortDate(exp)} (${dte}d)`;

            legendData.push(name);
            series.push({
                name: name,
                type: 'line',
                data: strikes.map((strike, idx) => [strike, ivs[idx]]),
                smooth: 0.4,
                symbol: 'circle',
                symbolSize: 6,
                lineStyle: { color: expColors[i % expColors.length], width: 2 },
                itemStyle: {
                    color: expColors[i % expColors.length],
                    borderColor: Config.theme.bgSecondary,
                    borderWidth: 2
                }
            });
        }

        if (!series.length) return;

        const spotPrice = data?.enriched?.meta?.spot_price;

        const option = {
            ...Config.echartsBase,
            title: { text: 'IV Smile by Expiration', ...Config.echartsBase.title },
            legend: {
                ...Config.echartsBase.legend,
                data: legendData,
                bottom: 5
            },
            tooltip: {
                ...Config.echartsBase.tooltip,
                trigger: 'axis',
                formatter: function(params) {
                    let html = `<b>Strike: ${params[0].data[0]}</b><br/>`;
                    params.forEach(p => {
                        html += `${p.seriesName}: ${p.data[1].toFixed(1)}%<br/>`;
                    });
                    return html;
                }
            },
            grid: { left: 50, right: 20, top: 40, bottom: 50 },
            xAxis: {
                type: 'value',
                ...Config.xAxis,
                axisLabel: {
                    ...Config.xAxis.axisLabel,
                    formatter: val => val.toLocaleString()
                }
            },
            yAxis: {
                type: 'value',
                ...Config.yAxis,
                axisLabel: {
                    ...Config.yAxis.axisLabel,
                    formatter: val => val.toFixed(0) + '%'
                }
            },
            series: series
        };

        // Add ATM mark line
        if (spotPrice) {
            option.series[0].markLine = Utils.createATMMarkLine(spotPrice);
        }

        chart.setOption(option);
    },

    /**
     * Renders the volatility surface 3D chart
     */
    renderVolSurfaceChart() {
        const chart = this.getChart('volSurfaceChart');
        if (!chart) return;

        const enrichedData = (typeof data !== 'undefined' && data.enriched) ? data.enriched.data || [] : [];

        if (!enrichedData.length) return;

        const ivData = enrichedData.filter(r => r.implied_vol !== null);
        if (ivData.length < 3) return;

        const strikes = [...new Set(ivData.map(r => r.strike))].sort((a, b) => a - b);
        const expirations = [...new Set(ivData.map(r => r.expiration))].sort();

        // Build IV map and collect stats
        const ivMap = {};
        const allIVs = [];
        for (const row of ivData) {
            if (!ivMap[row.expiration]) ivMap[row.expiration] = {};
            const ivPct = row.implied_vol * 100;
            ivMap[row.expiration][row.strike] = ivPct;
            allIVs.push(ivPct);
        }

        // Calculate stats for Z-score
        const mean = allIVs.reduce((a, b) => a + b, 0) / allIVs.length;
        const variance = allIVs.reduce((sum, iv) => sum + Math.pow(iv - mean, 2), 0) / allIVs.length;
        const stdDev = Math.sqrt(variance);

        // Get DTE for Y-axis
        const dteMap = {};
        for (const row of ivData) {
            dteMap[row.expiration] = row.dte;
        }

        // Build surface data: [[strike, dte, value], ...]
        const surfaceData = [];
        let minVal = Infinity, maxVal = -Infinity;

        for (const exp of expirations) {
            const dte = dteMap[exp];
            for (const strike of strikes) {
                const iv = ivMap[exp]?.[strike];
                if (iv !== undefined) {
                    let value;
                    if (this.volSurfaceMode === 'zscore') {
                        value = (iv - mean) / stdDev;
                    } else {
                        value = iv;
                    }
                    surfaceData.push([strike, dte, value]);
                    if (value < minVal) minVal = value;
                    if (value > maxVal) maxVal = value;
                }
            }
        }

        // Color scale based on mode
        const colorScale = this.volSurfaceMode === 'zscore'
            ? Config.colorScales.zscore.map(c => c[1])
            : Config.colorScales.iv.map(c => c[1]);

        // For Z-score, center at 0
        if (this.volSurfaceMode === 'zscore') {
            minVal = Math.max(-3, minVal);
            maxVal = Math.min(3, maxVal);
        }

        const option = {
            backgroundColor: 'transparent',
            visualMap: {
                show: true,
                dimension: 2,
                min: minVal,
                max: maxVal,
                inRange: { color: colorScale },
                right: 10,
                top: 'center',
                itemHeight: 120,
                textStyle: {
                    color: Config.theme.textMuted,
                    fontSize: 10
                },
                formatter: this.volSurfaceMode === 'zscore'
                    ? (val) => val.toFixed(1) + 'σ'
                    : (val) => val.toFixed(0) + '%'
            },
            tooltip: {
                ...Config.echartsBase.tooltip,
                formatter: (params) => {
                    const [strike, dte, value] = params.data;
                    if (this.volSurfaceMode === 'zscore') {
                        const rawIV = value * stdDev + mean;
                        return `Strike: ${strike}<br/>DTE: ${dte}d<br/>IV: ${rawIV.toFixed(1)}%<br/>Z: ${value >= 0 ? '+' : ''}${value.toFixed(2)}σ`;
                    }
                    return `Strike: ${strike}<br/>DTE: ${dte}d<br/>IV: ${value.toFixed(1)}%`;
                }
            },
            xAxis3D: {
                type: 'value',
                name: 'Strike',
                min: Math.min(...strikes),
                max: Math.max(...strikes),
                axisLabel: {
                    color: Config.theme.textMuted,
                    fontSize: 10
                },
                axisLine: { lineStyle: { color: Config.theme.border } },
                splitLine: { lineStyle: { color: Config.theme.bgTertiary } },
                nameTextStyle: { color: Config.theme.textMuted, fontSize: 11 }
            },
            yAxis3D: {
                type: 'value',
                name: 'DTE',
                axisLabel: {
                    color: Config.theme.textMuted,
                    fontSize: 10
                },
                axisLine: { lineStyle: { color: Config.theme.border } },
                splitLine: { lineStyle: { color: Config.theme.bgTertiary } },
                nameTextStyle: { color: Config.theme.textMuted, fontSize: 11 }
            },
            zAxis3D: {
                type: 'value',
                name: this.volSurfaceMode === 'zscore' ? 'Z-Score' : 'IV %',
                axisLabel: {
                    color: Config.theme.textMuted,
                    fontSize: 10,
                    formatter: this.volSurfaceMode === 'zscore'
                        ? (val) => (val >= 0 ? '+' : '') + val.toFixed(1)
                        : (val) => val.toFixed(0)
                },
                axisLine: { lineStyle: { color: Config.theme.border } },
                splitLine: { lineStyle: { color: Config.theme.bgTertiary } },
                nameTextStyle: { color: Config.theme.textMuted, fontSize: 11 }
            },
            grid3D: {
                ...Config.scene3D,
                boxWidth: 100,
                boxHeight: 50,
                boxDepth: 80
            },
            series: [{
                type: 'surface',
                wireframe: {
                    show: true,
                    lineStyle: { color: 'rgba(255,255,255,0.06)', width: 0.5 }
                },
                itemStyle: { opacity: 0.92 },
                shading: 'realistic',
                realisticMaterial: { roughness: 0.6, metalness: 0.1 },
                data: surfaceData
            }]
        };

        chart.setOption(option);
    },

    /**
     * Renders the Delta by Strike chart
     */
    renderDeltaByStrikeChart() {
        this.renderGreekChart('deltaByStrikeChart', 'Delta by Strike', 'delta', 'Delta', [
            '#3b82f6', '#06b6d4', '#0ea5e9', '#6366f1'
        ]);
    },

    /**
     * Renders the Theta by Strike chart
     */
    renderThetaByStrikeChart() {
        this.renderGreekChart('thetaByStrikeChart', 'Theta by Strike', 'theta', 'Theta', [
            '#ef4444', '#f97316', '#f59e0b', '#dc2626'
        ]);
    },

    /**
     * Renders the Vega by Strike chart
     */
    renderVegaByStrikeChart() {
        this.renderGreekChart('vegaByStrikeChart', 'Vega by Strike', 'vega', 'Vega', [
            '#10b981', '#14b8a6', '#22c55e', '#059669'
        ]);
    },

    /**
     * Renders the Gamma by Strike chart
     */
    renderGammaByStrikeChart() {
        this.renderGreekChart('gammaByStrikeChart', 'Gamma by Strike', 'gamma', 'Gamma', [
            '#a855f7', '#d946ef', '#8b5cf6', '#ec4899'
        ], 5);
    },

    /**
     * Generic Greek chart renderer
     */
    renderGreekChart(chartId, title, field, yAxisName, colors, decimals = 4) {
        const chart = this.getChart(chartId);
        if (!chart) return;

        const enrichedData = (typeof data !== 'undefined' && data.enriched) ? data.enriched.data || [] : [];
        const expFilter = (typeof selectedExpiration !== 'undefined') ? selectedExpiration : '';

        if (!enrichedData.length) return;

        const expirations = [...new Set(enrichedData.map(r => r.expiration))].sort();
        const expsToShow = expFilter ? [expFilter] : expirations.slice(0, 4);

        const series = [];
        const legendData = [];

        for (let i = 0; i < expsToShow.length; i++) {
            const exp = expsToShow[i];
            const expData = enrichedData
                .filter(r => r.expiration === exp && r[field] !== null)
                .sort((a, b) => a.strike - b.strike);

            if (expData.length < 2) continue;

            const dte = expData[0]?.dte || '?';
            const name = `${Utils.formatShortDate(exp)} (${dte}d)`;

            legendData.push(name);
            series.push({
                name: name,
                type: 'line',
                data: expData.map(r => [r.strike, r[field]]),
                smooth: 0.4,
                symbol: 'circle',
                symbolSize: 5,
                lineStyle: { color: colors[i % colors.length], width: 2 },
                itemStyle: {
                    color: colors[i % colors.length],
                    borderColor: Config.theme.bgSecondary,
                    borderWidth: 1
                }
            });
        }

        if (!series.length) return;

        const spotPrice = data?.enriched?.meta?.spot_price;

        const option = {
            ...Config.echartsBase,
            title: { text: title, ...Config.echartsBase.title },
            legend: {
                ...Config.echartsBase.legend,
                data: legendData,
                bottom: 5
            },
            tooltip: {
                ...Config.echartsBase.tooltip,
                trigger: 'axis',
                formatter: function(params) {
                    let html = `<b>Strike: ${params[0].data[0]}</b><br/>`;
                    params.forEach(p => {
                        html += `${p.seriesName}: ${p.data[1].toFixed(decimals)}<br/>`;
                    });
                    return html;
                }
            },
            grid: { left: 55, right: 20, top: 40, bottom: 50 },
            xAxis: {
                type: 'value',
                ...Config.xAxis,
                axisLabel: {
                    ...Config.xAxis.axisLabel,
                    formatter: val => val.toLocaleString()
                }
            },
            yAxis: {
                type: 'value',
                ...Config.yAxis
            },
            series: series
        };

        // Add ATM mark line
        if (spotPrice && series.length > 0) {
            option.series[0].markLine = Utils.createATMMarkLine(spotPrice);
        }

        chart.setOption(option);
    },

    /**
     * Dispose all chart instances
     */
    dispose() {
        Object.values(this.charts).forEach(chart => {
            if (chart) chart.dispose();
        });
        this.charts = {};
    },

    /**
     * Resize all charts
     */
    resize() {
        Object.values(this.charts).forEach(chart => {
            if (chart) chart.resize();
        });
    }
};

// =============================================================================
// Global function aliases for onclick handlers
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

function renderGreeksCharts() {
    GreeksComponent.renderCharts();
}
