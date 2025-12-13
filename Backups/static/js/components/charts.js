// =============================================================================
// SPX Options Monitor - Charts Component
// Renders the Charts tab with heatmaps, bar charts, and time series
// Depends on: config.js, utils.js, movers.js
// =============================================================================

const ChartsComponent = {
    // =========================================================================
    // Methods
    // =========================================================================

    /**
     * Returns HTML structure for charts tab
     * Reads from global `data` and `selectedExpiration`
     * @returns {string} HTML string
     */
    render() {
        // Access data from global scope (will be App.data later)
        const enrichedData = (typeof data !== 'undefined') ? data.enriched : { meta: {} };
        const meta = enrichedData.meta || {};
        const expFilter = (typeof selectedExpiration !== 'undefined') ? selectedExpiration : '';
        const hasYesterdayData = meta.yesterday_hour_source || meta.yesterday_eod_source;

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
                    <span class="meta-label">Yesterday Data</span>
                    <span class="meta-value ${hasYesterdayData ? 'positive' : 'warning'}">${hasYesterdayData ? 'Available' : 'None'}</span>
                </div>
            </div>

            <div class="chart-container chart-full">
                <div id="heatmapChart" style="height: 320px;"></div>
            </div>
            <div class="chart-grid">
                <div class="chart-container">
                    <div id="volumeByStrikeChart" style="height: 320px;"></div>
                </div>
                <div class="chart-container">
                    <div id="oiByStrikeChart" style="height: 320px;"></div>
                </div>
            </div>
            <div class="chart-grid">
                <div class="chart-container">
                    <div id="changeHeatmapChart" style="height: 320px;"></div>
                </div>
                <div class="chart-container">
                    <div id="volumeTimeChart" style="height: 320px;"></div>
                </div>
            </div>
        `;
    },

    /**
     * Renders all Plotly charts
     * Reads from global `data` object
     */
    renderPlotlyCharts() {
        const theme = Config.theme;
        const plotlyLayout = Config.plotlyLayout;
        const plotlyConfig = Config.plotlyConfig;

        // Access data from global scope
        const enrichedData = (typeof data !== 'undefined' && data.enriched) ? data.enriched.data || [] : [];
        const latestData = (typeof data !== 'undefined') ? data.latest || [] : [];

        if (!enrichedData.length && !latestData.length) {
            document.getElementById('volumeByStrikeChart').innerHTML = '<div class="loading">No data available</div>';
            return;
        }

        const chartData = enrichedData.length ? enrichedData : latestData;
        const suffix = MoversComponent.comparisonMode === 'hour' ? '_hour' : '_eod';

        // Get spot price for ATM reference line
        const spotPrice = (typeof data !== 'undefined' && data.enriched) ? data.enriched.meta?.spot_price : null;

        // Volume by Strike
        const strikes = chartData.map(r => r.strike);
        const volumes = chartData.map(r => r.volume_today || r.volume_cumulative || 0);

        // Find closest strike to spot price for ATM line
        let atmStrike = null;
        if (spotPrice && strikes.length) {
            atmStrike = strikes.reduce((prev, curr) =>
                Math.abs(curr - spotPrice) < Math.abs(prev - spotPrice) ? curr : prev
            );
        }

        // ATM reference line shape
        const atmShapes = atmStrike ? [{
            type: 'line',
            x0: atmStrike,
            x1: atmStrike,
            y0: 0,
            y1: 1,
            yref: 'paper',
            line: {
                color: theme.primary,
                width: 2,
                dash: 'dash'
            }
        }] : [];

        // ATM annotation
        const atmAnnotations = atmStrike ? [{
            x: atmStrike,
            y: 1,
            yref: 'paper',
            text: `ATM ${spotPrice?.toLocaleString() || ''}`,
            showarrow: false,
            font: {
                family: "'Source Sans Pro', Arial",
                size: 10,
                color: theme.primary
            },
            yanchor: 'bottom',
            yshift: 4
        }] : [];

        // IBKR-style muted color palette for bar charts
        const colors = chartData.map(r => {
            const pctChange = r['volume_pct_change' + suffix];
            if (pctChange === null || pctChange === undefined) return theme.neutral30;
            if (pctChange > 100) return '#b33a3a';       // Muted red
            if (pctChange > 50) return '#b87a14';        // Muted amber
            if (pctChange > 0) return '#2a8a5a';         // Muted green
            if (pctChange < 0) return '#3b72a8';         // Muted blue
            return theme.neutral30;
        });

        const hoverTexts = chartData.map(r => {
            const vol = r.volume_today || r.volume_cumulative || 0;
            const delta = r['volume_delta' + suffix] || 0;
            const pct = r['volume_pct_change' + suffix];
            const pctStr = pct !== null ? ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)` : '';
            return `Strike: ${r.strike}<br>Volume: ${vol.toLocaleString()}<br>Δ: ${delta > 0 ? '+' : ''}${delta.toLocaleString()}${pctStr}`;
        });

        Plotly.newPlot('volumeByStrikeChart', [{
            x: strikes,
            y: volumes,
            type: 'bar',
            marker: {
                color: colors,
                line: { color: 'rgba(0,0,0,0)', width: 0 }
            },
            hovertemplate: '%{text}<extra></extra>',
            text: hoverTexts,
            hoverlabel: {
                bgcolor: theme.neutral5,
                bordercolor: theme.neutral30,
                font: { family: "'Source Sans Pro', Arial", size: 12, color: theme.fontColor }
            }
        }], {
            ...plotlyLayout,
            title: { text: 'Volume by Strike', font: { size: 13, color: theme.textSecondary }, x: 0, xanchor: 'left' },
            xaxis: {
                ...plotlyLayout.xaxis,
                title: { text: 'Strike', font: { size: 11, color: theme.textMuted }, standoff: 6 }
            },
            yaxis: {
                ...plotlyLayout.yaxis,
                title: { text: 'Volume', font: { size: 11, color: theme.textMuted }, standoff: 6 }
            },
            bargap: 0.12,
            shapes: atmShapes,
            annotations: atmAnnotations
        }, {
            ...plotlyConfig,
            displayModeBar: true,
            modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
            displaylogo: false
        });

        // OI by Strike - IBKR-style muted palette
        const ois = chartData.map(r => r.open_interest || 0);
        const oiColors = chartData.map(r => {
            const oiPct = r.oi_pct_change;
            if (oiPct === null || oiPct === undefined) return '#7a5aaa';  // Muted purple
            if (oiPct > 5) return '#2a8a5a';   // Muted green
            if (oiPct < -5) return '#b33a3a';  // Muted red
            return '#7a5aaa';  // Muted purple (neutral OI change)
        });

        const oiHoverTexts = chartData.map(r => {
            const oi = r.open_interest || 0;
            const delta = r.oi_delta;
            const pct = r.oi_pct_change;
            let deltaStr = '';
            if (delta !== null) {
                deltaStr = `<br>Δ: ${delta > 0 ? '+' : ''}${delta.toLocaleString()}`;
                if (pct !== null) deltaStr += ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)`;
            }
            return `Strike: ${r.strike}<br>OI: ${oi.toLocaleString()}${deltaStr}`;
        });

        Plotly.newPlot('oiByStrikeChart', [{
            x: strikes,
            y: ois,
            type: 'bar',
            marker: {
                color: oiColors,
                line: { color: 'rgba(0,0,0,0)', width: 0 }
            },
            hovertemplate: '%{text}<extra></extra>',
            text: oiHoverTexts,
            hoverlabel: {
                bgcolor: theme.neutral5,
                bordercolor: theme.neutral30,
                font: { family: "'Source Sans Pro', Arial", size: 12, color: theme.fontColor }
            }
        }], {
            ...plotlyLayout,
            title: { text: 'Open Interest by Strike', font: { size: 13, color: theme.textSecondary }, x: 0, xanchor: 'left' },
            xaxis: {
                ...plotlyLayout.xaxis,
                title: { text: 'Strike', font: { size: 11, color: theme.textMuted }, standoff: 6 }
            },
            yaxis: {
                ...plotlyLayout.yaxis,
                title: { text: 'Open Interest', font: { size: 11, color: theme.textMuted }, standoff: 6 }
            },
            bargap: 0.12,
            shapes: atmShapes,
            annotations: atmAnnotations
        }, {
            ...plotlyConfig,
            displayModeBar: true,
            modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
            displaylogo: false
        });

        this.renderHeatmap();
        this.renderChangeHeatmap();
        this.renderVolumeTimeSeries();
    },

    /**
     * Renders the volume heatmap
     */
    renderHeatmap() {
        const theme = Config.theme;
        const plotlyLayout = Config.plotlyLayout;
        const plotlyConfig = Config.plotlyConfig;

        // Access data from global scope
        const enrichedData = (typeof data !== 'undefined' && data.enriched) ? data.enriched.data || [] : [];
        const latestData = (typeof data !== 'undefined') ? data.latest || [] : [];
        const intradayData = (typeof data !== 'undefined') ? data.intraday || [] : [];

        const allData = enrichedData.length ? enrichedData : (latestData.length ? latestData : intradayData);

        if (!allData.length) {
            document.getElementById('heatmapChart').innerHTML = '<div class="loading">No data</div>';
            return;
        }

        const expirations = [...new Set(allData.map(r => r.expiration))].sort();
        const strikes = [...new Set(allData.map(r => r.strike))].sort((a, b) => a - b);

        const z = [];
        const hoverText = [];

        for (const exp of expirations) {
            const row = [];
            const hoverRow = [];
            for (const strike of strikes) {
                const match = allData.find(r => r.expiration === exp && r.strike === strike);
                const vol = match ? (match.volume_today || match.volume_cumulative || 0) : 0;
                const notional = match ? (match.notional_today || 0) : 0;
                row.push(vol > 0 ? Math.log10(vol + 1) : 0);
                hoverRow.push(`${exp}<br>Strike: ${strike}<br>Vol: ${vol.toLocaleString()}<br>$${notional.toLocaleString()}`);
            }
            z.push(row);
            hoverText.push(hoverRow);
        }

        // IBKR-style muted colorscale
        const volumeColorscale = [
            [0, theme.neutral5],
            [0.1, theme.neutral10],
            [0.25, '#1e3a5f'],
            [0.4, '#2563a8'],
            [0.55, theme.info],
            [0.7, '#b87a14'],
            [0.85, theme.warning],
            [1, '#c45a28']
        ];

        // Limit x-axis ticks
        const maxTicks = 18;
        const tickStep = Math.ceil(strikes.length / maxTicks);
        const tickVals = strikes.filter((_, i) => i % tickStep === 0);

        // Format expiration dates
        const expLabels = expirations.map(Utils.formatShortDate);

        Plotly.newPlot('heatmapChart', [{
            z: z,
            x: strikes,
            y: expirations,
            type: 'heatmap',
            colorscale: volumeColorscale,
            hoverinfo: 'text',
            text: hoverText,
            xgap: 1,
            ygap: 1,
            colorbar: {
                title: {
                    text: 'Vol (log)',
                    font: { family: "'Source Sans Pro', Arial", size: 9, color: theme.textMuted },
                    side: 'right'
                },
                tickfont: { family: "'Source Sans Pro', Arial", size: 8, color: theme.textMuted },
                len: 0.75,
                thickness: 8,
                bgcolor: 'rgba(0,0,0,0)',
                bordercolor: 'rgba(0,0,0,0)',
                borderwidth: 0,
                outlinecolor: theme.border,
                outlinewidth: 1,
                xpad: 6,
                ticklen: 3
            },
            hoverlabel: {
                bgcolor: theme.neutral5,
                bordercolor: theme.neutral30,
                font: { family: "'Source Sans Pro', Arial", size: 12, color: theme.fontColor }
            }
        }], {
            ...plotlyLayout,
            title: { text: 'Volume Surface', font: { size: 13, color: theme.textSecondary }, x: 0, xanchor: 'left' },
            xaxis: {
                ...plotlyLayout.xaxis,
                title: { text: 'Strike', font: { size: 11, color: theme.textMuted }, standoff: 6 },
                type: 'category',
                showgrid: false,
                tickmode: 'array',
                tickvals: tickVals,
                ticktext: tickVals.map(String)
            },
            yaxis: {
                ...plotlyLayout.yaxis,
                title: '',
                type: 'category',
                showgrid: false,
                tickmode: 'array',
                tickvals: expirations,
                ticktext: expLabels
            }
        }, plotlyConfig);
    },

    /**
     * Renders the change heatmap
     */
    renderChangeHeatmap() {
        const theme = Config.theme;
        const plotlyLayout = Config.plotlyLayout;
        const plotlyConfig = Config.plotlyConfig;

        const enrichedData = (typeof data !== 'undefined' && data.enriched) ? data.enriched.data || [] : [];
        const suffix = MoversComponent.comparisonMode === 'hour' ? '_hour' : '_eod';

        if (!enrichedData.length) {
            document.getElementById('changeHeatmapChart').innerHTML = '<div class="loading">No data</div>';
            return;
        }

        const expirations = [...new Set(enrichedData.map(r => r.expiration))].sort();
        const strikes = [...new Set(enrichedData.map(r => r.strike))].sort((a, b) => a - b);

        const z = [];
        const hoverText = [];

        for (const exp of expirations) {
            const row = [];
            const hoverRow = [];
            for (const strike of strikes) {
                const match = enrichedData.find(r => r.expiration === exp && r.strike === strike);
                const pctChange = match ? match['volume_pct_change' + suffix] : null;
                const volDelta = match ? match['volume_delta' + suffix] : 0;

                let zVal = 0;
                if (pctChange !== null) {
                    zVal = Math.max(-100, Math.min(200, pctChange));
                }
                row.push(zVal);

                const pctStr = pctChange !== null ? `${pctChange > 0 ? '+' : ''}${pctChange.toFixed(1)}%` : '-';
                hoverRow.push(`${exp}<br>Strike: ${strike}<br>Δ: ${pctStr}<br>Vol: ${volDelta > 0 ? '+' : ''}${volDelta.toLocaleString()}`);
            }
            z.push(row);
            hoverText.push(hoverRow);
        }

        // IBKR-style diverging colorscale
        const changeColorscale = [
            [0, '#1e5a9e'],
            [0.25, '#3b82c4'],
            [0.4, '#4a6a85'],
            [0.5, theme.neutral10],
            [0.6, '#7a6045'],
            [0.75, '#b87a14'],
            [0.9, '#c45a28'],
            [1, '#b33a3a']
        ];

        // Limit x-axis ticks
        const maxTicks = 18;
        const tickStep = Math.ceil(strikes.length / maxTicks);
        const tickVals = strikes.filter((_, i) => i % tickStep === 0);

        // Format expiration dates
        const expLabels = expirations.map(Utils.formatShortDate);

        Plotly.newPlot('changeHeatmapChart', [{
            z: z,
            x: strikes,
            y: expirations,
            type: 'heatmap',
            colorscale: changeColorscale,
            zmid: 0,
            hoverinfo: 'text',
            text: hoverText,
            xgap: 1,
            ygap: 1,
            colorbar: {
                title: {
                    text: '% Chg',
                    font: { family: "'Source Sans Pro', Arial", size: 9, color: theme.textMuted },
                    side: 'right'
                },
                tickfont: { family: "'Source Sans Pro', Arial", size: 8, color: theme.textMuted },
                ticksuffix: '%',
                len: 0.75,
                thickness: 8,
                bgcolor: 'rgba(0,0,0,0)',
                bordercolor: 'rgba(0,0,0,0)',
                borderwidth: 0,
                outlinecolor: theme.border,
                outlinewidth: 1,
                xpad: 6,
                ticklen: 3
            },
            hoverlabel: {
                bgcolor: theme.neutral5,
                bordercolor: theme.neutral30,
                font: { family: "'Source Sans Pro', Arial", size: 12, color: theme.fontColor }
            }
        }], {
            ...plotlyLayout,
            title: { text: `Volume Change (vs ${MoversComponent.comparisonMode === 'hour' ? '1H' : 'EOD'})`, font: { size: 13, color: theme.textSecondary }, x: 0, xanchor: 'left' },
            xaxis: {
                ...plotlyLayout.xaxis,
                title: { text: 'Strike', font: { size: 11, color: theme.textMuted }, standoff: 6 },
                type: 'category',
                showgrid: false,
                tickmode: 'array',
                tickvals: tickVals,
                ticktext: tickVals.map(String)
            },
            yaxis: {
                ...plotlyLayout.yaxis,
                title: '',
                type: 'category',
                showgrid: false,
                tickmode: 'array',
                tickvals: expirations,
                ticktext: expLabels
            }
        }, plotlyConfig);
    },

    /**
     * Renders the volume time series chart
     */
    renderVolumeTimeSeries() {
        const theme = Config.theme;
        const plotlyLayout = Config.plotlyLayout;
        const plotlyConfig = Config.plotlyConfig;

        const intradayData = (typeof data !== 'undefined') ? data.intraday || [] : [];

        const timeGroups = {};

        for (const row of intradayData) {
            const time = row.captured_at;
            if (!timeGroups[time]) {
                timeGroups[time] = 0;
            }
            timeGroups[time] += row.volume_cumulative || 0;
        }

        const times = Object.keys(timeGroups).sort();
        const totalVolumes = times.map(t => timeGroups[t]);

        if (!times.length) {
            document.getElementById('volumeTimeChart').innerHTML = '<div class="loading">No intraday data</div>';
            return;
        }

        Plotly.newPlot('volumeTimeChart', [{
            x: times.map(t => t.substring(11, 16)),
            y: totalVolumes,
            type: 'scatter',
            mode: 'lines+markers',
            line: {
                color: theme.primary,
                width: 1.5,
                shape: 'linear'
            },
            marker: {
                color: theme.primary,
                size: 4,
                line: { color: theme.bgSecondary, width: 1 }
            },
            hovertemplate: '<b>%{x}</b><br>Volume: %{y:,.0f}<extra></extra>',
            hoverlabel: {
                bgcolor: theme.neutral5,
                bordercolor: theme.neutral30,
                font: { family: "'Source Sans Pro', Arial", size: 12, color: theme.fontColor }
            },
            fill: 'tozeroy',
            fillcolor: 'rgba(218, 27, 44, 0.06)'
        }], {
            ...plotlyLayout,
            title: { text: 'Total Volume Over Time', font: { size: 13, color: theme.textSecondary }, x: 0, xanchor: 'left' },
            xaxis: {
                ...plotlyLayout.xaxis,
                title: { text: 'Time (ET)', font: { size: 11, color: theme.textMuted }, standoff: 6 },
                rangeslider: {
                    visible: true,
                    thickness: 0.08,
                    bgcolor: theme.neutral5,
                    bordercolor: theme.border,
                    borderwidth: 1
                }
            },
            yaxis: {
                ...plotlyLayout.yaxis,
                title: { text: 'Cumulative Volume', font: { size: 11, color: theme.textMuted }, standoff: 6 }
            },
            margin: { t: 32, r: 12, b: 60, l: 48 }
        }, plotlyConfig);
    }
};

// =============================================================================
// Backward Compatibility - Global function aliases
// =============================================================================
function renderCharts() {
    return ChartsComponent.render();
}

function renderPlotlyCharts() {
    ChartsComponent.renderPlotlyCharts();
}

function renderHeatmap() {
    ChartsComponent.renderHeatmap();
}

function renderChangeHeatmap() {
    ChartsComponent.renderChangeHeatmap();
}

function renderVolumeTimeSeries() {
    ChartsComponent.renderVolumeTimeSeries();
}
