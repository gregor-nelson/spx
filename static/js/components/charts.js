// =============================================================================
// SPX Options Monitor - Charts Component (ECharts)
// Renders the Charts tab with heatmaps, bar charts, and time series
// =============================================================================

const ChartsComponent = {
    // Chart instances
    charts: {},

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
                <div id="heatmapChart" class="chart-wrapper" style="height: 300px;"></div>
            </div>
            <div class="chart-grid">
                <div class="chart-container">
                    <div id="volumeByStrikeChart" class="chart-wrapper" style="height: 300px;"></div>
                </div>
                <div class="chart-container">
                    <div id="oiByStrikeChart" class="chart-wrapper" style="height: 300px;"></div>
                </div>
            </div>
            <div class="chart-grid">
                <div class="chart-container">
                    <div id="changeHeatmapChart" class="chart-wrapper" style="height: 300px;"></div>
                </div>
                <div class="chart-container">
                    <div id="volumeTimeChart" class="chart-wrapper" style="height: 300px;"></div>
                </div>
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

        this.renderVolumeByStrike();
        this.renderOIByStrike();
        this.renderHeatmap();
        this.renderChangeHeatmap();
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
     * Volume Surface Heatmap
     */
    renderHeatmap() {
        const chart = this.getChart('heatmapChart');
        if (!chart) return;

        const enrichedData = (typeof data !== 'undefined' && data.enriched) ? data.enriched.data || [] : [];
        const latestData = (typeof data !== 'undefined') ? data.latest || [] : [];
        const intradayData = (typeof data !== 'undefined') ? data.intraday || [] : [];

        const allData = enrichedData.length ? enrichedData : (latestData.length ? latestData : intradayData);
        if (!allData.length) return;

        const expirations = [...new Set(allData.map(r => r.expiration))].sort();
        const strikes = [...new Set(allData.map(r => r.strike))].sort((a, b) => a - b);

        const heatmapData = [];
        let maxVol = 0;

        for (let i = 0; i < expirations.length; i++) {
            for (let j = 0; j < strikes.length; j++) {
                const match = allData.find(r => r.expiration === expirations[i] && r.strike === strikes[j]);
                const vol = match ? (match.volume_today || match.volume_cumulative || 0) : 0;
                const logVol = vol > 0 ? Math.log10(vol + 1) : 0;
                heatmapData.push([j, i, logVol]);
                if (logVol > maxVol) maxVol = logVol;
            }
        }

        const option = {
            ...Config.echartsBase,
            title: { text: 'Volume Surface', ...Config.echartsBase.title },
            tooltip: {
                ...Config.echartsBase.tooltip,
                formatter: function(params) {
                    const strike = strikes[params.data[0]];
                    const exp = expirations[params.data[1]];
                    const match = allData.find(r => r.expiration === exp && r.strike === strike);
                    const vol = match ? (match.volume_today || match.volume_cumulative || 0) : 0;
                    const notional = match ? (match.notional_today || 0) : 0;
                    return `<b>${Utils.formatShortDate(exp)}</b><br/>Strike: ${strike}<br/>Vol: ${vol.toLocaleString()}<br/>$${notional.toLocaleString()}`;
                }
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
                data: expirations.map(Utils.formatShortDate),
                ...Config.yAxis
            },
            visualMap: {
                min: 0,
                max: maxVol || 5,
                calculable: true,
                orient: 'vertical',
                right: 10,
                top: 'center',
                itemHeight: 120,
                inRange: {
                    color: Config.colorScales.volume.map(c => c[1])
                },
                textStyle: {
                    color: Config.theme.textMuted,
                    fontSize: 10
                },
                formatter: function(value) {
                    return Math.pow(10, value).toFixed(0);
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

        chart.setOption(option);
    },

    /**
     * Change Heatmap
     */
    renderChangeHeatmap() {
        const chart = this.getChart('changeHeatmapChart');
        if (!chart) return;

        const enrichedData = (typeof data !== 'undefined' && data.enriched) ? data.enriched.data || [] : [];
        if (!enrichedData.length) return;

        const suffix = MoversComponent.comparisonMode === 'hour' ? '_hour' : '_eod';

        const expirations = [...new Set(enrichedData.map(r => r.expiration))].sort();
        const strikes = [...new Set(enrichedData.map(r => r.strike))].sort((a, b) => a - b);

        const heatmapData = [];

        for (let i = 0; i < expirations.length; i++) {
            for (let j = 0; j < strikes.length; j++) {
                const match = enrichedData.find(r => r.expiration === expirations[i] && r.strike === strikes[j]);
                const pctChange = match ? match['volume_pct_change' + suffix] : null;
                const zVal = pctChange !== null ? Math.max(-100, Math.min(200, pctChange)) : null;
                heatmapData.push([j, i, zVal]);
            }
        }

        const option = {
            ...Config.echartsBase,
            title: { text: `Volume Change (vs ${MoversComponent.comparisonMode === 'hour' ? '1H' : 'EOD'})`, ...Config.echartsBase.title },
            tooltip: {
                ...Config.echartsBase.tooltip,
                formatter: function(params) {
                    if (params.data[2] === null) return '';
                    const strike = strikes[params.data[0]];
                    const exp = expirations[params.data[1]];
                    const match = enrichedData.find(r => r.expiration === exp && r.strike === strike);
                    const pctChange = match ? match['volume_pct_change' + suffix] : null;
                    const volDelta = match ? match['volume_delta' + suffix] : 0;
                    const pctStr = pctChange !== null ? `${pctChange > 0 ? '+' : ''}${pctChange.toFixed(1)}%` : '-';
                    return `<b>${Utils.formatShortDate(exp)}</b><br/>Strike: ${strike}<br/>Δ: ${pctStr}<br/>Vol: ${volDelta > 0 ? '+' : ''}${volDelta.toLocaleString()}`;
                }
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
                data: expirations.map(Utils.formatShortDate),
                ...Config.yAxis
            },
            visualMap: {
                min: -100,
                max: 200,
                calculable: true,
                orient: 'vertical',
                right: 10,
                top: 'center',
                itemHeight: 120,
                inRange: {
                    color: Config.colorScales.change.map(c => c[1])
                },
                textStyle: {
                    color: Config.theme.textMuted,
                    fontSize: 10
                },
                formatter: function(value) {
                    return value.toFixed(0) + '%';
                }
            },
            series: [{
                type: 'heatmap',
                data: heatmapData.filter(d => d[2] !== null),
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

        chart.setOption(option);
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
