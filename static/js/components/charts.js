// =============================================================================
// SPX Options Monitor - Charts Component (ECharts)
// Renders the Charts tab with heatmaps, bar charts, and time series
// =============================================================================

const ChartsComponent = {
    // Chart instances
    charts: {},

    // State
    volumeMode: '3d',  // '3d' or '2d'
    oiMode: 'current',  // 'current', 'change', or 'pct'

    /**
     * Sets the volume surface display mode (3D or 2D)
     */
    setVolumeMode(mode) {
        this.volumeMode = mode;

        document.querySelectorAll('.surface-mode-toggle .toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        this.renderVolumeSurface();
    },

    /**
     * Sets the OI chart display mode (Current, Change, or % Change)
     */
    setOIMode(mode) {
        this.oiMode = mode;

        document.querySelectorAll('.oi-mode-toggle .toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        this.renderOIByStrike();
    },

    /**
     * Returns HTML structure for charts tab
     */
    render() {
        const enrichedData = (typeof data !== 'undefined') ? data.enriched : { meta: {} };
        const meta = enrichedData.meta || {};
        const expFilter = (typeof selectedExpiration !== 'undefined') ? selectedExpiration : '';
        const hasYesterdayData = meta.yesterday_hour_source || meta.yesterday_eod_source;

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
                    <span class="meta-label">Yesterday Data</span>
                    <span class="meta-value ${hasYesterdayData ? 'positive' : 'warning'}">${hasYesterdayData ? 'Available' : 'None'}</span>
                </div>
            </div>

            <div class="chart-container chart-full">
                <div class="chart-header">
                    <span class="chart-title">Volume Surface</span>
                    <div class="surface-mode-toggle panel-toggles">
                        <button class="toggle-btn active" data-mode="3d" onclick="ChartsComponent.setVolumeMode('3d')" title="3D Surface View">3D</button>
                        <button class="toggle-btn" data-mode="2d" onclick="ChartsComponent.setVolumeMode('2d')" title="2D Heatmap View">2D</button>
                    </div>
                </div>
                <div id="volumeSurfaceChart" class="chart-wrapper"></div>
            </div>
            <div class="chart-container chart-full">
                <div id="volumeByStrikeChart" class="chart-wrapper"></div>
            </div>
            <div class="chart-container chart-full">
                <div class="chart-header">
                    <span class="chart-title">Open Interest by Strike</span>
                    <div class="oi-mode-toggle panel-toggles">
                        <button class="toggle-btn active" data-mode="current" onclick="ChartsComponent.setOIMode('current')" title="Current open interest">Current</button>
                        <button class="toggle-btn" data-mode="change" onclick="ChartsComponent.setOIMode('change')" title="Change from yesterday">Change</button>
                        <button class="toggle-btn" data-mode="pct" onclick="ChartsComponent.setOIMode('pct')" title="Percent change from yesterday">% Chg</button>
                    </div>
                </div>
                <div id="oiByStrikeChart" class="chart-wrapper"></div>
            </div>
        `;
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
     * Renders all charts
     */
    renderCharts() {
        const enrichedData = (typeof data !== 'undefined' && data.enriched) ? data.enriched.data || [] : [];
        const latestData = (typeof data !== 'undefined') ? data.latest || [] : [];

        if (!enrichedData.length && !latestData.length) {
            return;
        }

        this.renderVolumeSurface();
        this.renderVolumeByStrike();
        this.renderOIByStrike();
    },

    /**
     * Volume by Strike Bar Chart
     */
    renderVolumeByStrike() {
        const chart = this.getChart('volumeByStrikeChart');
        if (!chart) return;

        const enrichedData = (typeof data !== 'undefined' && data.enriched) ? data.enriched.data || [] : [];
        const latestData = (typeof data !== 'undefined') ? data.latest || [] : [];
        const chartData = enrichedData.length ? enrichedData : latestData;

        if (!chartData.length) return;

        const suffix = MoversComponent.comparisonMode === 'hour' ? '_hour' : '_eod';
        const spotPrice = data?.enriched?.meta?.spot_price;

        const strikes = chartData.map(r => r.strike);
        const volumes = chartData.map(r => r.volume_today || r.volume_cumulative || 0);
        const colors = chartData.map(r => {
            const pctChange = r['volume_pct_change' + suffix];
            return Utils.getHeatColor(pctChange);
        });

        const option = {
            ...Config.echartsBase,
            title: { text: 'Volume by Strike', ...Config.echartsBase.title },
            tooltip: {
                ...Config.echartsBase.tooltip,
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: function(params) {
                    const d = chartData[params[0].dataIndex];
                    const vol = d.volume_today || d.volume_cumulative || 0;
                    const delta = d['volume_delta' + suffix] || 0;
                    const pct = d['volume_pct_change' + suffix];
                    const pctStr = pct !== null && pct !== undefined ? ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)` : '';
                    return `<b>Strike: ${d.strike}</b><br/>Volume: ${vol.toLocaleString()}<br/>Δ: ${delta > 0 ? '+' : ''}${delta.toLocaleString()}${pctStr}`;
                }
            },
            xAxis: {
                type: 'category',
                data: strikes,
                ...Config.xAxis,
                axisLabel: {
                    ...Config.xAxis.axisLabel,
                    rotate: 45,
                    interval: Math.ceil(strikes.length / 15)
                }
            },
            yAxis: {
                type: 'value',
                ...Config.yAxis
            },
            series: [{
                type: 'bar',
                data: volumes.map((v, i) => ({
                    value: v,
                    itemStyle: { color: colors[i] }
                })),
                barMaxWidth: 20,
                markLine: spotPrice ? Utils.createATMMarkLine(spotPrice) : null
            }]
        };

        chart.setOption(option);
    },

    /**
     * OI by Strike Bar Chart (mode-aware: current, change, pct)
     */
    renderOIByStrike() {
        const chart = this.getChart('oiByStrikeChart');
        if (!chart) return;

        const enrichedData = (typeof data !== 'undefined' && data.enriched) ? data.enriched.data || [] : [];
        const latestData = (typeof data !== 'undefined') ? data.latest || [] : [];
        const chartData = enrichedData.length ? enrichedData : latestData;

        if (!chartData.length) return;

        const spotPrice = data?.enriched?.meta?.spot_price;
        const strikes = chartData.map(r => r.strike);

        // Chart title based on mode
        const titles = {
            'current': 'Open Interest by Strike',
            'change': 'OI Change by Strike (vs Yesterday)',
            'pct': 'OI % Change by Strike (vs Yesterday)'
        };
        const chartTitle = titles[this.oiMode];

        // Values and colors based on mode
        let values, colors;

        if (this.oiMode === 'current') {
            // Current: show absolute OI, color by pct change
            values = chartData.map(r => r.open_interest || 0);
            colors = chartData.map(r => {
                const oiPct = r.oi_pct_change;
                if (oiPct === null || oiPct === undefined) return Config.theme.accentPurple;
                if (oiPct > 5) return Config.theme.positive;
                if (oiPct < -5) return Config.theme.negative;
                return Config.theme.accentPurple;
            });
        } else if (this.oiMode === 'change') {
            // Change: show oi_delta, color by positive/negative
            values = chartData.map(r => r.oi_delta ?? 0);
            colors = chartData.map(r => {
                const delta = r.oi_delta;
                if (delta === null || delta === undefined) return Config.theme.textMuted;
                if (delta > 0) return Config.theme.positive;
                if (delta < 0) return Config.theme.negative;
                return Config.theme.accentPurple;
            });
        } else {
            // Pct: show oi_pct_change, color by positive/negative
            values = chartData.map(r => r.oi_pct_change ?? 0);
            colors = chartData.map(r => {
                const pct = r.oi_pct_change;
                if (pct === null || pct === undefined) return Config.theme.textMuted;
                if (pct > 0) return Config.theme.positive;
                if (pct < 0) return Config.theme.negative;
                return Config.theme.accentPurple;
            });
        }

        // Tooltip always shows full context
        const oiMode = this.oiMode;
        const tooltipFormatter = function(params) {
            const d = chartData[params[0].dataIndex];
            const oi = d.open_interest || 0;
            const delta = d.oi_delta;
            const pct = d.oi_pct_change;
            const yest = d.oi_yesterday;

            let html = `<b>Strike: ${d.strike}</b><br/>`;
            html += `Current OI: ${oi.toLocaleString()}<br/>`;

            if (yest !== null && yest !== undefined) {
                html += `Yesterday OI: ${yest.toLocaleString()}<br/>`;
            }
            if (delta !== null && delta !== undefined) {
                html += `Change: ${delta > 0 ? '+' : ''}${delta.toLocaleString()}`;
                if (pct !== null && pct !== undefined) {
                    html += ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)`;
                }
            }
            return html;
        };

        // Y-axis config (add % formatter for pct mode)
        const yAxisConfig = {
            type: 'value',
            ...Config.yAxis
        };
        if (this.oiMode === 'pct') {
            yAxisConfig.axisLabel = {
                ...Config.yAxis.axisLabel,
                formatter: val => val.toFixed(1) + '%'
            };
        }

        const option = {
            ...Config.echartsBase,
            title: { text: chartTitle, ...Config.echartsBase.title },
            tooltip: {
                ...Config.echartsBase.tooltip,
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: tooltipFormatter
            },
            xAxis: {
                type: 'category',
                data: strikes,
                ...Config.xAxis,
                axisLabel: {
                    ...Config.xAxis.axisLabel,
                    rotate: 45,
                    interval: Math.ceil(strikes.length / 15)
                }
            },
            yAxis: yAxisConfig,
            series: [{
                type: 'bar',
                data: values.map((v, i) => ({
                    value: v,
                    itemStyle: { color: colors[i] }
                })),
                barMaxWidth: 20,
                markLine: spotPrice ? Utils.createATMMarkLine(spotPrice) : null
            }]
        };

        chart.setOption(option);
    },

    /**
     * Volume Surface - 3D or 2D mode
     */
    renderVolumeSurface() {
        const chart = this.getChart('volumeSurfaceChart');
        if (!chart) return;

        const enrichedData = (typeof data !== 'undefined' && data.enriched) ? data.enriched.data || [] : [];
        const latestData = (typeof data !== 'undefined') ? data.latest || [] : [];
        const intradayData = (typeof data !== 'undefined') ? data.intraday || [] : [];

        const allData = enrichedData.length ? enrichedData : (latestData.length ? latestData : intradayData);
        if (!allData.length) return;

        const expirations = [...new Set(allData.map(r => r.expiration))].sort();
        const strikes = [...new Set(allData.map(r => r.strike))].sort((a, b) => a - b);
        const spotPrice = data?.enriched?.meta?.spot_price;

        // Build volume map and DTE map
        const volMap = {};
        const dteMap = {};
        let maxLogVol = 0;

        for (const row of allData) {
            if (!volMap[row.expiration]) volMap[row.expiration] = {};
            const vol = row.volume_today || row.volume_cumulative || 0;
            const logVol = vol > 0 ? Math.log10(vol + 1) : 0;
            volMap[row.expiration][row.strike] = { vol, logVol, notional: row.notional_today || 0 };
            if (logVol > maxLogVol) maxLogVol = logVol;
            if (row.dte !== undefined) dteMap[row.expiration] = row.dte;
        }

        // Fallback DTE calculation if not available
        for (const exp of expirations) {
            if (dteMap[exp] === undefined) {
                const expDate = new Date(exp);
                const today = new Date();
                dteMap[exp] = Math.max(0, Math.ceil((expDate - today) / (1000 * 60 * 60 * 24)));
            }
        }

        if (this.volumeMode === '3d') {
            this.renderVolumeSurface3D(chart, strikes, expirations, volMap, dteMap, maxLogVol, spotPrice);
        } else {
            this.renderVolumeSurface2D(chart, strikes, expirations, volMap, dteMap, maxLogVol);
        }
    },

    /**
     * 3D Volume Bar Chart
     */
    renderVolumeSurface3D(chart, strikes, expirations, volMap, dteMap, maxLogVol, spotPrice) {
        // Build bar data: [[strike, dte, logVolume], ...]
        let barData = [];

        for (const exp of expirations) {
            const dte = dteMap[exp];
            for (const strike of strikes) {
                const volData = volMap[exp]?.[strike];
                if (volData && volData.vol > 0) {
                    barData.push({
                        value: [strike, dte, volData.logVol],
                        vol: volData.vol,
                        notional: volData.notional,
                        exp: exp
                    });
                }
            }
        }

        // Filter to top volume points when data is too dense (> 300 bars)
        // This ensures individual bars remain distinguishable without overlap
        const totalBars = barData.length;
        const isFiltered = barData.length > 300;
        if (isFiltered) {
            barData.sort((a, b) => b.vol - a.vol);
            barData = barData.slice(0, 300);
        }
        const displayedBars = barData.length;

        // Calculate axis ranges
        const strikeMin = Math.min(...strikes);
        const strikeMax = Math.max(...strikes);
        const strikeRange = strikeMax - strikeMin || 100;

        const dteValues = Object.values(dteMap);
        const dteMin = Math.min(...dteValues);
        const dteMax = Math.max(...dteValues);
        const dteRange = dteMax - dteMin || 7;

        // Calculate bar size as a proportion of axis range
        // Use small multiplier to create narrow spike-like columns
        const strikeBarSize = Math.max(0.5, (strikeRange / strikes.length) * 0.1);
        const dteBarSize = Math.max(0.1, (dteRange / expirations.length) * 0.15);

        // Build status text
        const statusText = isFiltered
            ? `Showing top ${displayedBars} of ${totalBars} by volume · ${strikes.length} strikes · ${expirations.length} expirations`
            : `${displayedBars} points · ${strikes.length} strikes · ${expirations.length} expirations`;

        const option = {
            backgroundColor: 'transparent',
            graphic: [{
                type: 'text',
                left: 10,
                top: 5,
                style: {
                    text: statusText,
                    fill: Config.theme.textMuted,
                    fontSize: 11,
                    fontFamily: "'IBM Plex Sans', -apple-system, sans-serif"
                }
            }],
            tooltip: {
                ...Config.echartsBase.tooltip,
                formatter: (params) => {
                    const d = params.data;
                    const [strike, dte] = d.value;
                    const atmLabel = (spotPrice && Math.abs(strike - spotPrice) < 10) ? ' (ATM)' : '';
                    return `<b>Strike: ${strike.toLocaleString()}${atmLabel}</b><br/>` +
                           `Exp: ${Utils.formatShortDate(d.exp)} (${dte}d)<br/>` +
                           `Volume: ${d.vol.toLocaleString()}<br/>` +
                           `Notional: $${d.notional.toLocaleString()}`;
                }
            },
            visualMap: {
                show: true,
                dimension: 2,
                min: 0,
                max: maxLogVol || 5,
                inRange: {
                    color: Config.colorScales.volume.map(c => c[1])
                },
                right: 10,
                top: 'center',
                itemHeight: 140,
                textStyle: {
                    color: Config.theme.textMuted,
                    fontSize: 10
                },
                formatter: (val) => {
                    const actualVol = Math.pow(10, val);
                    if (actualVol >= 1000) return (actualVol / 1000).toFixed(0) + 'K';
                    return actualVol.toFixed(0);
                }
            },
            xAxis3D: {
                type: 'value',
                name: 'Strike',
                min: strikeMin - strikeBarSize,
                max: strikeMax + strikeBarSize,
                axisLabel: {
                    color: Config.theme.textMuted,
                    fontSize: 10,
                    formatter: (val) => val.toLocaleString()
                },
                axisLine: { lineStyle: { color: Config.theme.border } },
                splitLine: { lineStyle: { color: Config.theme.bgTertiary, opacity: 0.3 } },
                nameTextStyle: { color: Config.theme.textSecondary, fontSize: 11 }
            },
            yAxis3D: {
                type: 'value',
                name: 'DTE',
                min: 0,
                axisLabel: {
                    color: Config.theme.textMuted,
                    fontSize: 10
                },
                axisLine: { lineStyle: { color: Config.theme.border } },
                splitLine: { lineStyle: { color: Config.theme.bgTertiary, opacity: 0.3 } },
                nameTextStyle: { color: Config.theme.textSecondary, fontSize: 11 }
            },
            zAxis3D: {
                type: 'value',
                name: 'Volume',
                min: 0,
                axisLabel: {
                    color: Config.theme.textMuted,
                    fontSize: 10,
                    formatter: (val) => {
                        const actualVol = Math.pow(10, val);
                        if (actualVol >= 1000) return (actualVol / 1000).toFixed(0) + 'K';
                        return actualVol.toFixed(0);
                    }
                },
                axisLine: { lineStyle: { color: Config.theme.border } },
                splitLine: { lineStyle: { color: Config.theme.bgTertiary, opacity: 0.3 } },
                nameTextStyle: { color: Config.theme.textSecondary, fontSize: 11 }
            },
            grid3D: {
                boxWidth: 100,
                boxHeight: 70,
                boxDepth: 80,
                viewControl: {
                    alpha: 20,
                    beta: 40,
                    distance: 200,
                    autoRotate: false,
                    animation: true,
                    damping: 0.8,
                    rotateSensitivity: 1,
                    zoomSensitivity: 1,
                    panSensitivity: 1
                },
                light: {
                    main: {
                        intensity: 1.2,
                        shadow: true,
                        shadowQuality: 'medium',
                        alpha: 40,
                        beta: 50
                    },
                    ambient: {
                        intensity: 0.5
                    }
                },
                postEffect: {
                    enable: true,
                    bloom: {
                        enable: true,
                        intensity: 0.08
                    },
                    SSAO: {
                        enable: true,
                        radius: 3,
                        intensity: 1
                    }
                },
                temporalSuperSampling: {
                    enable: true
                }
            },
            series: [{
                type: 'bar3D',
                data: barData,
                bevelSize: 0,
                bevelSmoothness: 0,
                shading: 'realistic',
                realisticMaterial: {
                    roughness: 0.5,
                    metalness: 0.1
                },
                barSize: [strikeBarSize, dteBarSize],
                emphasis: {
                    itemStyle: {
                        color: Config.theme.accent
                    },
                    label: {
                        show: false
                    }
                }
            }]
        };

        chart.setOption(option, true);
    },

    /**
     * 2D Volume Surface (Heatmap fallback)
     */
    renderVolumeSurface2D(chart, strikes, expirations, volMap, dteMap, maxLogVol) {
        const heatmapData = [];

        for (let i = 0; i < expirations.length; i++) {
            for (let j = 0; j < strikes.length; j++) {
                const volData = volMap[expirations[i]]?.[strikes[j]];
                const logVol = volData ? volData.logVol : 0;
                heatmapData.push([j, i, logVol]);
            }
        }

        const option = {
            ...Config.echartsBase,
            tooltip: {
                ...Config.echartsBase.tooltip,
                formatter: function(params) {
                    const strike = strikes[params.data[0]];
                    const exp = expirations[params.data[1]];
                    const volData = volMap[exp]?.[strike];
                    const vol = volData ? volData.vol : 0;
                    const notional = volData ? volData.notional : 0;
                    const dte = dteMap[exp];
                    return `<b>${Utils.formatShortDate(exp)} (${dte}d)</b><br/>` +
                           `Strike: ${strike}<br/>` +
                           `Volume: ${vol.toLocaleString()}<br/>` +
                           `Notional: $${notional.toLocaleString()}`;
                }
            },
            grid: {
                left: 60,
                right: 80,
                top: 20,
                bottom: 40
            },
            xAxis: {
                type: 'category',
                data: strikes,
                ...Config.xAxis,
                name: 'Strike',
                axisLabel: {
                    ...Config.xAxis.axisLabel,
                    interval: Math.ceil(strikes.length / 18)
                }
            },
            yAxis: {
                type: 'category',
                data: expirations.map(exp => `${Utils.formatShortDate(exp)} (${dteMap[exp]}d)`),
                ...Config.yAxis
            },
            visualMap: {
                min: 0,
                max: maxLogVol || 5,
                calculable: true,
                orient: 'vertical',
                right: 10,
                top: 'center',
                itemHeight: 140,
                inRange: {
                    color: Config.colorScales.volume.map(c => c[1])
                },
                textStyle: {
                    color: Config.theme.textMuted,
                    fontSize: 10
                },
                formatter: function(value) {
                    const actualVol = Math.pow(10, value);
                    if (actualVol >= 1000) return (actualVol / 1000).toFixed(0) + 'K';
                    return actualVol.toFixed(0);
                }
            },
            series: [{
                type: 'heatmap',
                data: heatmapData,
                itemStyle: {
                    borderColor: Config.theme.bgSecondary,
                    borderWidth: 1
                },
                emphasis: {
                    itemStyle: {
                        borderColor: Config.theme.text,
                        borderWidth: 2
                    }
                }
            }]
        };

        chart.setOption(option, true);
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

// Global function aliases for backward compatibility
function renderCharts() {
    return ChartsComponent.render();
}

function renderChartsCharts() {
    ChartsComponent.renderCharts();
}
