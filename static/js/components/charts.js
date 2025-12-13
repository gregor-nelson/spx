// =============================================================================
// SPX Options Monitor - Charts Component (ECharts)
// Renders the Charts tab with heatmaps, bar charts, and time series
// =============================================================================

const ChartsComponent = {
    // Chart instances
    charts: {},

    // State
    volumeMode: '3d',  // '3d' or '2d'

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
                <div id="volumeSurfaceChart" class="chart-wrapper" style="height: 380px;"></div>
            </div>
            <div class="chart-grid">
                <div class="chart-container">
                    <div id="volumeByStrikeChart" class="chart-wrapper" style="height: 300px;"></div>
                </div>
                <div class="chart-container">
                    <div id="oiByStrikeChart" class="chart-wrapper" style="height: 300px;"></div>
                </div>
            </div>
            <div class="chart-container chart-full">
                <div id="volumeTimeChart" class="chart-wrapper" style="height: 280px;"></div>
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
        this.renderVolumeTimeSeries();
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
                name: 'Strike',
                axisLabel: {
                    ...Config.xAxis.axisLabel,
                    rotate: 45,
                    interval: Math.ceil(strikes.length / 15)
                }
            },
            yAxis: {
                type: 'value',
                ...Config.yAxis,
                name: 'Volume'
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
     * OI by Strike Bar Chart
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
        const ois = chartData.map(r => r.open_interest || 0);
        const colors = chartData.map(r => {
            const oiPct = r.oi_pct_change;
            if (oiPct === null || oiPct === undefined) return Config.theme.accentPurple;
            if (oiPct > 5) return Config.theme.positive;
            if (oiPct < -5) return Config.theme.negative;
            return Config.theme.accentPurple;
        });

        const option = {
            ...Config.echartsBase,
            title: { text: 'Open Interest by Strike', ...Config.echartsBase.title },
            tooltip: {
                ...Config.echartsBase.tooltip,
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: function(params) {
                    const d = chartData[params[0].dataIndex];
                    const oi = d.open_interest || 0;
                    const delta = d.oi_delta;
                    const pct = d.oi_pct_change;
                    let deltaStr = '';
                    if (delta !== null && delta !== undefined) {
                        deltaStr = `<br/>Δ: ${delta > 0 ? '+' : ''}${delta.toLocaleString()}`;
                        if (pct !== null && pct !== undefined) deltaStr += ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)`;
                    }
                    return `<b>Strike: ${d.strike}</b><br/>OI: ${oi.toLocaleString()}${deltaStr}`;
                }
            },
            xAxis: {
                type: 'category',
                data: strikes,
                ...Config.xAxis,
                name: 'Strike',
                axisLabel: {
                    ...Config.xAxis.axisLabel,
                    rotate: 45,
                    interval: Math.ceil(strikes.length / 15)
                }
            },
            yAxis: {
                type: 'value',
                ...Config.yAxis,
                name: 'Open Interest'
            },
            series: [{
                type: 'bar',
                data: ois.map((v, i) => ({
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
     * 3D Volume Surface
     */
    renderVolumeSurface3D(chart, strikes, expirations, volMap, dteMap, maxLogVol, spotPrice) {
        // Build surface data: [[strike, dte, logVolume], ...]
        const surfaceData = [];

        for (const exp of expirations) {
            const dte = dteMap[exp];
            for (const strike of strikes) {
                const volData = volMap[exp]?.[strike];
                if (volData) {
                    surfaceData.push([strike, dte, volData.logVol]);
                }
            }
        }

        // Find ATM strike index for reference
        const atmStrike = spotPrice ? strikes.reduce((prev, curr) =>
            Math.abs(curr - spotPrice) < Math.abs(prev - spotPrice) ? curr : prev
        ) : null;

        const option = {
            backgroundColor: 'transparent',
            tooltip: {
                ...Config.echartsBase.tooltip,
                formatter: (params) => {
                    const [strike, dte, logVol] = params.data;
                    const exp = expirations.find(e => dteMap[e] === dte) || '';
                    const volData = volMap[exp]?.[strike];
                    const vol = volData ? volData.vol : 0;
                    const notional = volData ? volData.notional : 0;
                    const atmLabel = (spotPrice && Math.abs(strike - spotPrice) < 5) ? ' (ATM)' : '';
                    return `<b>Strike: ${strike}${atmLabel}</b><br/>` +
                           `Exp: ${Utils.formatShortDate(exp)} (${dte}d)<br/>` +
                           `Volume: ${vol.toLocaleString()}<br/>` +
                           `Notional: $${notional.toLocaleString()}`;
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
                min: Math.min(...strikes),
                max: Math.max(...strikes),
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
                boxWidth: 120,
                boxHeight: 60,
                boxDepth: 80,
                viewControl: {
                    alpha: 25,
                    beta: 45,
                    distance: 220,
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
                        shadowQuality: 'high',
                        alpha: 35,
                        beta: 40
                    },
                    ambient: {
                        intensity: 0.4
                    }
                },
                postEffect: {
                    enable: true,
                    bloom: {
                        enable: true,
                        intensity: 0.1
                    },
                    SSAO: {
                        enable: true,
                        radius: 4,
                        intensity: 1.2
                    }
                },
                temporalSuperSampling: {
                    enable: true
                }
            },
            series: [{
                type: 'surface',
                wireframe: {
                    show: true,
                    lineStyle: {
                        color: 'rgba(255, 255, 255, 0.08)',
                        width: 0.5
                    }
                },
                itemStyle: {
                    opacity: 0.95
                },
                shading: 'realistic',
                realisticMaterial: {
                    roughness: 0.55,
                    metalness: 0.1
                },
                data: surfaceData,
                emphasis: {
                    itemStyle: {
                        opacity: 1
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
     * Volume Time Series
     */
    renderVolumeTimeSeries() {
        const chart = this.getChart('volumeTimeChart');
        if (!chart) return;

        const intradayData = (typeof data !== 'undefined') ? data.intraday || [] : [];
        if (!intradayData.length) return;

        const timeGroups = {};
        for (const row of intradayData) {
            const time = row.captured_at;
            if (!timeGroups[time]) timeGroups[time] = 0;
            timeGroups[time] += row.volume_cumulative || 0;
        }

        const times = Object.keys(timeGroups).sort();
        const volumes = times.map(t => timeGroups[t]);

        const option = {
            ...Config.echartsBase,
            title: { text: 'Total Volume Over Time', ...Config.echartsBase.title },
            tooltip: {
                ...Config.echartsBase.tooltip,
                trigger: 'axis',
                formatter: function(params) {
                    return `<b>${params[0].axisValue}</b><br/>Volume: ${params[0].value.toLocaleString()}`;
                }
            },
            xAxis: {
                type: 'category',
                data: times.map(t => t.substring(11, 16)),
                ...Config.xAxis,
                name: 'Time (ET)'
            },
            yAxis: {
                type: 'value',
                ...Config.yAxis,
                name: 'Cumulative Volume'
            },
            dataZoom: [{
                type: 'inside',
                start: 0,
                end: 100
            }, {
                type: 'slider',
                start: 0,
                end: 100,
                height: 20,
                bottom: 5,
                borderColor: Config.theme.border,
                fillerColor: Config.theme.accentDim,
                handleStyle: {
                    color: Config.theme.accent
                },
                textStyle: {
                    color: Config.theme.textMuted,
                    fontSize: 10
                }
            }],
            series: [{
                type: 'line',
                data: volumes,
                smooth: 0.3,
                symbol: 'circle',
                symbolSize: 6,
                lineStyle: {
                    color: Config.theme.negative,
                    width: 2
                },
                itemStyle: {
                    color: Config.theme.negative,
                    borderColor: Config.theme.bgSecondary,
                    borderWidth: 2
                },
                areaStyle: {
                    color: {
                        type: 'linear',
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(255, 71, 87, 0.2)' },
                            { offset: 1, color: 'rgba(255, 71, 87, 0)' }
                        ]
                    }
                }
            }]
        };

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

// Global function aliases for backward compatibility
function renderCharts() {
    return ChartsComponent.render();
}

function renderChartsCharts() {
    ChartsComponent.renderCharts();
}
