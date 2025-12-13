// =============================================================================
// SPX Options Monitor - Movers Component
// Renders the right-side movers panel
// Depends on: config.js
// =============================================================================

const MoversComponent = {
    // =========================================================================
    // State
    // =========================================================================
    sortBy: 'volume',        // 'volume', 'oi', 'delta', 'notional'
    comparisonMode: 'hour',  // 'hour' or 'eod'

    // =========================================================================
    // Methods
    // =========================================================================

    /**
     * Set comparison mode (1H vs EOD) and re-render
     * @param {string} mode - 'hour' or 'eod'
     */
    setComparisonMode(mode) {
        this.comparisonMode = mode;

        // Update toggle buttons
        document.querySelectorAll('.comparison-toggle .toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.textContent === (mode === 'hour' ? '1H' : 'EOD'));
        });

        this.render();

        // Re-render charts if on charts tab (charts use comparison mode too)
        if (typeof currentTab !== 'undefined' && currentTab === 'charts') {
            if (typeof renderPlotlyCharts === 'function') {
                renderPlotlyCharts();
            } else if (typeof ChartsComponent !== 'undefined') {
                ChartsComponent.renderPlotlyCharts();
            }
        }
    },

    /**
     * Set sort field and re-render
     * @param {string} type - 'volume', 'oi', 'delta', or 'notional'
     */
    setSortBy(type) {
        this.sortBy = type;

        // Update sort buttons
        document.querySelectorAll('.sort-controls .sort-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sort === type);
        });

        this.render();
    },

    /**
     * Render the movers panel
     * Reads from global `data` object (will be App.data in final version)
     */
    render() {
        const container = document.getElementById('moversList');
        if (!container) return;

        // Access data from global scope (will be App.data later)
        const enrichedData = (typeof data !== 'undefined' && data.enriched)
            ? data.enriched.data || []
            : [];

        if (!enrichedData.length) {
            container.innerHTML = '<div class="no-data">No data</div>';
            return;
        }

        const suffix = this.comparisonMode === 'hour' ? '_hour' : '_eod';
        const sortBy = this.sortBy;

        // Determine sort field and get value for each row
        const getSortValue = (r) => {
            switch (sortBy) {
                case 'volume': return r.volume_today || 0;
                case 'oi': return r.open_interest || 0;
                case 'delta': return r['volume_delta' + suffix] || 0;
                case 'notional': return r.notional_today || 0;
                default: return r.volume_today || 0;
            }
        };

        // Get column header based on sort
        const getColumnHeader = () => {
            switch (sortBy) {
                case 'volume': return 'VOL';
                case 'oi': return 'OI';
                case 'delta': return 'Δ VOL';
                case 'notional': return 'NOTIONAL';
                default: return 'VOL';
            }
        };

        // Format value based on sort type
        const formatValue = (r) => {
            switch (sortBy) {
                case 'volume':
                    return (r.volume_today || 0).toLocaleString();
                case 'oi':
                    return (r.open_interest || 0).toLocaleString();
                case 'delta':
                    const delta = r['volume_delta' + suffix] || 0;
                    return (delta > 0 ? '+' : '') + delta.toLocaleString();
                case 'notional':
                    const notional = r.notional_today || 0;
                    return notional >= 1000000
                        ? `$${(notional / 1000000).toFixed(1)}M`
                        : `$${(notional / 1000).toFixed(0)}K`;
                default:
                    return (r.volume_today || 0).toLocaleString();
            }
        };

        // Get value class for coloring
        const getValueClass = (r) => {
            if (sortBy === 'delta') {
                const delta = r['volume_delta' + suffix] || 0;
                return delta > 0 ? 'positive' : (delta < 0 ? 'negative' : '');
            }
            return '';
        };

        const sorted = [...enrichedData]
            .filter(r => {
                const val = getSortValue(r);
                return val !== null && val !== undefined && val > 0;
            })
            .sort((a, b) => getSortValue(b) - getSortValue(a))
            .slice(0, 10);

        if (!sorted.length) {
            container.innerHTML = '<div class="no-data">No movers detected</div>';
            return;
        }

        // Build table header
        const headerHtml = `
            <div class="movers-table-header">
                <span>STRIKE</span>
                <span>DTE</span>
                <span style="text-align:right">${getColumnHeader()}</span>
                <span></span>
            </div>
        `;

        // Build table rows
        const rowsHtml = sorted.map(r => {
            const hasFlags = r.flags && r.flags.length > 0;
            const flagsHtml = hasFlags
                ? r.flags.map(f => `<span class="flag ${f}">${f.charAt(0).toUpperCase()}</span>`).join('')
                : '';

            return `
                <div class="mover-row ${hasFlags ? 'has-flags' : ''}">
                    <span class="mover-strike">${r.strike}</span>
                    <span class="mover-dte">${r.dte}d</span>
                    <span class="mover-value ${getValueClass(r)}">${formatValue(r)}</span>
                    <span class="mover-flags">${flagsHtml}</span>
                </div>
            `;
        }).join('');

        container.innerHTML = headerHtml + `<div class="movers-table-body">${rowsHtml}</div>`;
    }
};

// =============================================================================
// Backward Compatibility - Global function aliases for HTML onclick handlers
// =============================================================================
function setComparisonMode(mode) {
    MoversComponent.setComparisonMode(mode);
}

function setSortBy(type) {
    MoversComponent.setSortBy(type);
}

function renderMoversPanel() {
    MoversComponent.render();
}

// Keep global variables in sync for backward compatibility during transition
// These will be removed in Phase 6 when App takes over state management
let moversSortBy = MoversComponent.sortBy;
let comparisonMode = MoversComponent.comparisonMode;
