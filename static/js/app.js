// =============================================================================
// SPX Options Monitor - Main Application
// Orchestrates data loading, tab switching, and component rendering
// =============================================================================

// Application State
let currentTab = 'charts';
let currentSidebarTab = 'plot';  // 'plot' or 'movers'
let selectedExpiration = '';
let strikePlotMode = 'volume';  // 'volume', 'oi', 'delta'
let strikePlotChart = null;

let data = {
    enriched: { data: [], meta: {} },
    latest: [],
    intraday: [],
    daily: [],
    alerts: [],
    expirations: { intraday: [], daily: [] }
};

let cachedStats = null;

// =============================================================================
// Data Loading
// =============================================================================

async function fetchJSON(url) {
    // Prepend apiBase for reverse proxy support (e.g., '/spx' for glkn.xyz/spx)
    const fullUrl = Config.apiBase + url;
    const res = await fetch(fullUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function loadExpirations() {
    try {
        data.expirations = await fetchJSON('/api/expirations');
        updateExpirationDropdown();
    } catch (e) {
        console.error('Failed to load expirations:', e);
    }
}

function updateExpirationDropdown() {
    const select = document.getElementById('expirationFilter');
    if (!select) return;

    const exps = data.expirations.intraday || [];
    const currentValue = select.value;

    select.innerHTML = '<option value="">All</option>';

    for (const exp of exps) {
        const opt = document.createElement('option');
        opt.value = exp.expiration;
        opt.textContent = `${Utils.formatShortDate(exp.expiration)} (${exp.dte}d)`;
        select.appendChild(opt);
    }

    if (currentValue && [...select.options].some(o => o.value === currentValue)) {
        select.value = currentValue;
    }

    // Update sidebar stat
    const sidebarExp = document.getElementById('sidebarExpirations');
    if (sidebarExp) sidebarExp.textContent = exps.length;
}

function onExpirationChange() {
    selectedExpiration = document.getElementById('expirationFilter').value;
    loadData();
}

async function loadStats() {
    try {
        const stats = await fetchJSON('/api/stats');
        cachedStats = stats;

        // Update sidebar stats
        const pollsEl = document.getElementById('statPolls');
        const dbSizeEl = document.getElementById('sidebarDbSize');

        if (pollsEl) pollsEl.textContent = stats.intraday?.poll_count || 0;
        if (dbSizeEl) dbSizeEl.textContent = stats.db_size_mb + ' MB';

        // Update header stats
        updateHeaderStats(null, stats);
    } catch (e) {
        console.error('Failed to load stats:', e);
    }
}

async function loadData() {
    const expParam = selectedExpiration ? `?expiration=${selectedExpiration}` : '';

    try {
        const [enriched, latest, intraday, daily, alerts] = await Promise.all([
            fetchJSON('/api/intraday/latest/enriched' + expParam),
            fetchJSON('/api/intraday/latest' + expParam),
            fetchJSON('/api/intraday' + expParam),
            fetchJSON('/api/daily' + expParam),
            fetchJSON('/api/alerts')
        ]);

        data.enriched = enriched;
        data.latest = latest;
        data.intraday = intraday;
        data.daily = daily;
        data.alerts = alerts;

        // Update header with enriched meta
        updateHeaderStats(enriched.meta, cachedStats);

        // Render current tab
        renderTab();

        // Render movers panel
        MoversComponent.render();

        // Render strike plot
        renderStrikePlot();

        // Update last update time
        const lastUpdateEl = document.getElementById('sidebarLastUpdate');
        if (lastUpdateEl) {
            lastUpdateEl.textContent = enriched.meta?.captured_at
                ? Utils.formatTime(enriched.meta.captured_at)
                : new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        }

    } catch (e) {
        console.error('Failed to load data:', e);
        const content = document.getElementById('contentCenter');
        if (content) {
            content.innerHTML = '<div class="content-loading">Error loading data. Is the server running?</div>';
        }
    }
}

async function loadAll() {
    showLoading(true);

    await loadExpirations();
    await loadStats();
    await loadData();

    showLoading(false);
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = show ? 'flex' : 'none';
    }
}

// =============================================================================
// Header Updates
// =============================================================================

function updateHeaderStats(meta, stats) {
    // Ticker price
    const tickerPrice = document.getElementById('tickerPrice');
    const tickerChange = document.getElementById('tickerChange');
    if (tickerPrice && meta?.spot_price) {
        tickerPrice.textContent = meta.spot_price.toLocaleString();
    }

    // Header stats
    const contractsEl = document.getElementById('statContracts');
    const flaggedEl = document.getElementById('statFlagged');
    const pollsEl = document.getElementById('statPolls');
    const alertsEl = document.getElementById('statAlerts');

    if (contractsEl && meta?.contracts_count) {
        contractsEl.textContent = meta.contracts_count;
    }

    if (flaggedEl) {
        const flagged = meta?.contracts_with_flags || 0;
        flaggedEl.textContent = flagged;
        flaggedEl.classList.toggle('negative', flagged > 0);
    }

    if (pollsEl && stats?.intraday?.poll_count) {
        pollsEl.textContent = stats.intraday.poll_count;
    }

    if (alertsEl && stats) {
        const alertCount = stats.alert_count || 0;
        alertsEl.textContent = alertCount;
        alertsEl.classList.toggle('negative', alertCount > 0);
    }
}

function updateHeaderTime() {
    const timeEl = document.getElementById('headerTime');
    if (timeEl) {
        const now = new Date();
        timeEl.textContent = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    }
}

// =============================================================================
// Tab Navigation
// =============================================================================

function showTab(tab) {
    currentTab = tab;

    // Update active tab styling
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    const activeTab = document.querySelector(`.nav-tab[data-tab="${tab}"]`);
    if (activeTab) activeTab.classList.add('active');

    renderTab();
}

function renderTab() {
    const content = document.getElementById('contentCenter');
    if (!content) return;

    // Dispose existing charts before rendering new content
    if (typeof ChartsComponent !== 'undefined') ChartsComponent.dispose();
    if (typeof GreeksComponent !== 'undefined') GreeksComponent.dispose();

    switch (currentTab) {
        case 'charts':
            content.innerHTML = ChartsComponent.render();
            ChartsComponent.renderCharts();
            break;
        case 'greeks':
            content.innerHTML = GreeksComponent.render();
            GreeksComponent.renderCharts();
            break;
        case 'latest':
            content.innerHTML = TablesComponent.renderSnapshot(data.enriched.data || data.latest, true);
            TablesComponent.attachSortHandlers('snapshot');
            break;
        case 'intraday':
            content.innerHTML = TablesComponent.renderSnapshot(data.intraday, true);
            TablesComponent.attachSortHandlers('snapshot');
            break;
        case 'history':
            content.innerHTML = TablesComponent.renderDaily(data.daily);
            TablesComponent.attachSortHandlers('daily');
            break;
        case 'alerts':
            content.innerHTML = TablesComponent.renderAlerts(data.alerts);
            TablesComponent.attachSortHandlers('alerts');
            break;
        default:
            content.innerHTML = '<div class="content-loading">Unknown tab</div>';
    }
}

// =============================================================================
// Left Sidebar - Tab Navigation
// =============================================================================

function showSidebarTab(tab) {
    currentSidebarTab = tab;

    // Update tab button active states
    document.querySelectorAll('.sidebar-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.sidebarTab === tab);
    });

    // Update content visibility
    document.querySelectorAll('.sidebar-tab-content').forEach(content => {
        content.classList.toggle('active', content.dataset.tabContent === tab);
    });

    // Resize chart when Plot tab becomes visible
    if (tab === 'plot' && strikePlotChart) {
        setTimeout(() => strikePlotChart.resize(), 0);
    }
}

// =============================================================================
// Left Sidebar - Strike Plot
// =============================================================================

function setStrikePlotMode(mode) {
    strikePlotMode = mode;

    // Update toggle buttons
    document.querySelectorAll('#sidebarTabPlot .panel-toggles .toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    renderStrikePlot();
}

function renderStrikePlot() {
    const container = document.getElementById('strikePlotChart');
    if (!container) return;

    const enrichedData = data.enriched.data || [];
    if (!enrichedData.length) {
        container.innerHTML = '<div class="content-loading">No data</div>';
        return;
    }

    // Dispose old chart
    if (strikePlotChart) {
        strikePlotChart.dispose();
    }
    strikePlotChart = echarts.init(container);

    const suffix = MoversComponent.comparisonMode === 'hour' ? '_hour' : '_eod';
    const spotPrice = data.enriched.meta?.spot_price;

    // Aggregate by strike
    const strikeMap = {};
    for (const row of enrichedData) {
        if (!strikeMap[row.strike]) {
            strikeMap[row.strike] = {
                strike: row.strike,
                volume: 0,
                oi: 0,
                delta: 0
            };
        }
        strikeMap[row.strike].volume += row.volume_today || 0;
        strikeMap[row.strike].oi += row.open_interest || 0;
        strikeMap[row.strike].delta += row['volume_delta' + suffix] || 0;
    }

    const strikes = Object.keys(strikeMap).map(Number).sort((a, b) => b - a);  // High to low for y-axis
    const chartData = strikes.map(s => strikeMap[s]);

    // Get values based on mode
    const getValue = (d) => {
        switch (strikePlotMode) {
            case 'volume': return d.volume;
            case 'oi': return d.oi;
            case 'delta': return d.delta;
            default: return d.volume;
        }
    };

    // Get color based on mode
    const getColor = (d) => {
        if (strikePlotMode === 'delta') {
            return d.delta >= 0 ? Config.theme.positive : Config.theme.negative;
        }
        return Config.theme.accent;
    };

    const option = {
        backgroundColor: 'transparent',
        grid: {
            left: 45,
            right: 10,
            top: 10,
            bottom: 10
        },
        tooltip: {
            ...Config.echartsBase.tooltip,
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: function(params) {
                const d = chartData[params[0].dataIndex];
                let val;
                switch (strikePlotMode) {
                    case 'volume': val = `Vol: ${d.volume.toLocaleString()}`; break;
                    case 'oi': val = `OI: ${d.oi.toLocaleString()}`; break;
                    case 'delta': val = `Chg: ${(d.delta >= 0 ? '+' : '') + d.delta.toLocaleString()}`; break;
                }
                return `<b>Strike: ${d.strike}</b><br/>${val}`;
            }
        },
        xAxis: {
            type: 'value',
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { lineStyle: { color: Config.theme.bgTertiary } },
            axisLabel: { show: false }
        },
        yAxis: {
            type: 'category',
            data: strikes,
            axisLine: { lineStyle: { color: Config.theme.border } },
            axisTick: { show: false },
            axisLabel: {
                color: Config.theme.textMuted,
                fontSize: 9,
                interval: Math.ceil(strikes.length / 15)
            }
        },
        series: [{
            type: 'bar',
            data: chartData.map(d => ({
                value: getValue(d),
                itemStyle: { color: getColor(d) }
            })),
            barWidth: '60%',
            markLine: spotPrice ? {
                silent: true,
                symbol: 'none',
                lineStyle: {
                    color: Config.theme.neutral,
                    type: 'dashed',
                    width: 1
                },
                label: {
                    formatter: 'ATM',
                    position: 'end',
                    fontSize: 9,
                    color: Config.theme.neutral
                },
                data: [{ yAxis: Utils.findClosestStrike(strikes, spotPrice) }]
            } : null
        }]
    };

    strikePlotChart.setOption(option);
}

// =============================================================================
// Window Resize Handler
// =============================================================================

function handleResize() {
    // Resize strike plot only when visible
    if (currentSidebarTab === 'plot' && strikePlotChart) {
        strikePlotChart.resize();
    }

    if (currentTab === 'charts' && typeof ChartsComponent !== 'undefined') {
        ChartsComponent.resize();
    }
    if (currentTab === 'greeks' && typeof GreeksComponent !== 'undefined') {
        GreeksComponent.resize();
    }
}

// =============================================================================
// Initialization
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Start clock updates
    updateHeaderTime();
    setInterval(updateHeaderTime, 1000);

    // Initial data load
    loadAll();

    // Auto-refresh every 60 seconds
    setInterval(loadAll, 60000);

    // Resize handler
    window.addEventListener('resize', Utils.debounce(handleResize, 200));
});

// =============================================================================
// Expose globals for onclick handlers in HTML
// =============================================================================
// These are called from index.html onclick attributes
// showTab, onExpirationChange, setStrikePlotMode, setComparisonMode, setMoverSort
// are already defined above as global functions
