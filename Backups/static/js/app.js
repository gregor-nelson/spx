// =============================================================================
// SPX Options Monitor - Main Application (IBKR Theme)
// Depends on: config.js, utils.js, components/*
// =============================================================================

// Shorthand references for cleaner code
const theme = Config.theme;
const plotlyLayout = Config.plotlyLayout;
const plotlyConfig = Config.plotlyConfig;

// Sidebar state
let sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';

function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    localStorage.setItem('sidebarCollapsed', sidebarCollapsed);
    applySidebarState();
}

function applySidebarState() {
    const terminal = document.getElementById('terminal');
    const toggleIcon = document.getElementById('toggleIcon');

    if (sidebarCollapsed) {
        terminal.classList.add('sidebar-collapsed');
        toggleIcon.className = 'ph ph-caret-right';
    } else {
        terminal.classList.remove('sidebar-collapsed');
        toggleIcon.className = 'ph ph-caret-left';
    }

    // Trigger Plotly resize after transition
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 200);
}

// Detail panel state
let detailCollapsed = localStorage.getItem('detailCollapsed') === 'true';

function toggleDetailPanel() {
    detailCollapsed = !detailCollapsed;
    localStorage.setItem('detailCollapsed', detailCollapsed);
    applyDetailPanelState();
}

function applyDetailPanelState() {
    const terminal = document.getElementById('terminal');
    const toggleIcon = document.getElementById('detailToggleIcon');

    if (detailCollapsed) {
        terminal.classList.add('detail-collapsed');
        toggleIcon.className = 'ph ph-caret-left';
    } else {
        terminal.classList.remove('detail-collapsed');
        toggleIcon.className = 'ph ph-caret-right';
    }

    // Trigger Plotly resize after transition
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 200);
}

// Initialize panel states on load
document.addEventListener('DOMContentLoaded', () => {
    applySidebarState();
    applyDetailPanelState();
    updateToolbarTime();
    setInterval(updateToolbarTime, 1000);
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl+B to toggle left sidebar
    if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
    }
    // Ctrl+] to toggle right panel
    if (e.ctrlKey && e.key === ']') {
        e.preventDefault();
        toggleDetailPanel();
    }
});

function updateToolbarTime() {
    const timeEl = document.getElementById('toolbarTime');
    if (timeEl) {
        const now = new Date();
        timeEl.textContent = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    }
}

function updateToolbarStats(meta, stats) {
    const spxEl = document.getElementById('toolbarSpx');
    const contractsEl = document.getElementById('toolbarContracts');
    const flaggedEl = document.getElementById('toolbarFlagged');
    const pollsEl = document.getElementById('toolbarPolls');
    const alertsEl = document.getElementById('toolbarAlerts');

    if (spxEl && meta.spot_price) {
        spxEl.textContent = meta.spot_price.toLocaleString();
    }
    if (contractsEl && meta.contracts_count) {
        contractsEl.textContent = meta.contracts_count;
    }
    if (flaggedEl) {
        const flagged = meta.contracts_with_flags || 0;
        flaggedEl.textContent = flagged;
        flaggedEl.className = 'stat-value' + (flagged > 0 ? ' negative' : '');
    }
    if (pollsEl && stats) {
        pollsEl.textContent = stats.intraday?.poll_count || 0;
    }
    if (alertsEl && stats) {
        const alertCount = stats.alert_count || 0;
        alertsEl.textContent = alertCount;
        alertsEl.className = 'stat-value' + (alertCount > 0 ? ' negative' : '');
    }
}

let currentTab = 'charts';
let selectedExpiration = '';
// moversSortBy and comparisonMode moved to components/movers.js
let data = {
    enriched: { data: [], meta: {} },
    latest: [],
    intraday: [],
    daily: [],
    alerts: [],
    expirations: { intraday: [], daily: [] }
};

async function fetchJSON(url) {
    const res = await fetch(url);
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
    const exps = data.expirations.intraday;
    const currentValue = select.value;

    select.innerHTML = '<option value="">All</option>';

    for (const exp of exps) {
        const opt = document.createElement('option');
        opt.value = exp.expiration;
        opt.textContent = `${exp.expiration} (${exp.dte}d)`;
        select.appendChild(opt);
    }

    if (currentValue && [...select.options].some(o => o.value === currentValue)) {
        select.value = currentValue;
    }

    document.getElementById('statExpirations').textContent = exps.length;
}

function onExpirationChange() {
    selectedExpiration = document.getElementById('expirationFilter').value;
    loadData();
}

let cachedStats = null;

async function loadStats() {
    try {
        const stats = await fetchJSON('/api/stats');
        cachedStats = stats;
        document.getElementById('statPolls').textContent = stats.intraday.poll_count || 0;
        document.getElementById('statContracts').textContent = stats.intraday.unique_contracts || 0;
        document.getElementById('statDbSize').textContent = stats.db_size_mb + ' MB';

        // Update toolbar
        document.getElementById('toolbarPolls').textContent = stats.intraday.poll_count || 0;
        const alertCount = stats.alert_count || 0;
        const alertsEl = document.getElementById('toolbarAlerts');
        alertsEl.textContent = alertCount;
        alertsEl.className = 'stat-value' + (alertCount > 0 ? ' negative' : '');
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

        // Update toolbar with enriched meta
        const meta = enriched.meta || {};
        const spxEl = document.getElementById('toolbarSpx');
        const contractsEl = document.getElementById('toolbarContracts');
        const flaggedEl = document.getElementById('toolbarFlagged');

        if (spxEl) {
            spxEl.textContent = meta.spot_price ? meta.spot_price.toLocaleString() : '-';
        }
        if (contractsEl) {
            contractsEl.textContent = meta.contracts_count || '-';
        }
        if (flaggedEl) {
            const flagged = meta.contracts_with_flags || 0;
            flaggedEl.textContent = flagged;
            flaggedEl.className = 'stat-value' + (flagged > 0 ? ' negative' : '');
        }

        renderTab();
        renderMoversPanel();
    } catch (e) {
        console.error('Failed to load data:', e);
        document.getElementById('content').innerHTML =
            '<div class="loading">Error loading data. Is the server running?</div>';
    }
}

async function loadAll() {
    document.getElementById('lastUpdated').textContent = 'Loading...';

    await loadExpirations();
    await loadStats();
    await loadData();

    document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString();
}

function showTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    // Use closest to handle clicks on child elements (icon, text)
    const clickedTab = event.target.closest('.nav-tab');
    if (clickedTab) {
        clickedTab.classList.add('active');
    }
    renderTab();
}

function renderTab() {
    const content = document.getElementById('content');

    switch (currentTab) {
        case 'charts':
            content.innerHTML = renderCharts();
            renderPlotlyCharts();
            break;
        case 'greeks':
            content.innerHTML = renderGreeksTab();
            renderGreeksCharts();
            break;
        case 'latest':
            content.innerHTML = renderSnapshotTable(data.latest, true);
            break;
        case 'intraday':
            content.innerHTML = renderSnapshotTable(data.intraday, true);
            break;
        case 'daily':
            content.innerHTML = renderDailyTable(data.daily);
            break;
        case 'alerts':
            content.innerHTML = renderAlertsTable(data.alerts);
            break;
    }
}

// Shorthand references for utility functions
const formatShortDate = Utils.formatShortDate;
const formatNumber = Utils.formatNumber;
const formatMoney = Utils.formatMoney;
const formatPercent = Utils.formatPercent;

// Initial load
loadAll();

// Auto-refresh every 60 seconds
setInterval(loadAll, 60000);
