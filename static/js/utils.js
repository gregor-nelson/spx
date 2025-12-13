// =============================================================================
// SPX Options Monitor - Utility Functions
// =============================================================================

const Utils = {
    /**
     * Format a number with thousand separators
     * @param {number} num - Number to format
     * @returns {string} Formatted number or '-' if null/undefined
     */
    formatNumber(num) {
        if (num === null || num === undefined) return '-';
        return num.toLocaleString();
    },

    /**
     * Format a number as currency
     * @param {number} num - Number to format
     * @returns {string} Formatted currency or '-' if null/undefined
     */
    formatMoney(num) {
        if (num === null || num === undefined) return '-';
        if (num >= 1000000) {
            return `$${(num / 1000000).toFixed(1)}M`;
        } else if (num >= 1000) {
            return `$${(num / 1000).toFixed(0)}K`;
        }
        return `$${num.toFixed(2)}`;
    },

    /**
     * Format a decimal as percentage
     * @param {number} num - Decimal to format
     * @returns {string} Formatted percentage or '-' if null/undefined
     */
    formatPercent(num) {
        if (num === null || num === undefined) return '-';
        return `${(num * 100).toFixed(1)}%`;
    },

    /**
     * Format an ISO date string to short format (Dec 20)
     * @param {string} dateStr - ISO date string (YYYY-MM-DD)
     * @returns {string} Short date format
     */
    formatShortDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr + 'T00:00:00');
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    },

    /**
     * Format time from ISO timestamp
     * @param {string} timestamp - ISO timestamp
     * @returns {string} Time in HH:MM format
     */
    formatTime(timestamp) {
        if (!timestamp) return '-';
        return timestamp.substring(11, 16);
    },

    /**
     * Get color for a value change
     * @param {number} value - The change value
     * @returns {string} CSS color
     */
    getChangeColor(value) {
        if (value > 0) return Config.theme.positive;
        if (value < 0) return Config.theme.negative;
        return Config.theme.textMuted;
    },

    /**
     * Get color based on percentage change thresholds
     * @param {number} pctChange - Percentage change
     * @returns {string} CSS color
     */
    getHeatColor(pctChange) {
        if (pctChange === null || pctChange === undefined) return Config.theme.bgTertiary;
        if (pctChange > 100) return '#ff4757';
        if (pctChange > 50) return '#ffa502';
        if (pctChange > 0) return '#00d4aa';
        if (pctChange < 0) return '#3b82f6';
        return Config.theme.bgTertiary;
    },

    /**
     * Debounce a function
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in ms
     * @returns {Function} Debounced function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Create ECharts markLine for ATM reference
     * @param {number} spotPrice - Current spot price
     * @returns {Object} ECharts markLine config
     */
    createATMMarkLine(spotPrice) {
        if (!spotPrice) return null;
        return {
            silent: true,
            symbol: 'none',
            lineStyle: {
                color: Config.theme.neutral,
                type: 'dashed',
                width: 1
            },
            label: {
                formatter: `ATM ${spotPrice.toLocaleString()}`,
                position: 'end',
                fontSize: 10,
                color: Config.theme.neutral
            },
            data: [{ xAxis: spotPrice }]
        };
    },

    /**
     * Find the closest strike to spot price
     * @param {Array} strikes - Array of strike prices
     * @param {number} spotPrice - Current spot price
     * @returns {number} Closest strike
     */
    findClosestStrike(strikes, spotPrice) {
        if (!strikes.length || !spotPrice) return null;
        return strikes.reduce((prev, curr) =>
            Math.abs(curr - spotPrice) < Math.abs(prev - spotPrice) ? curr : prev
        );
    },

    /**
     * Group array by key
     * @param {Array} array - Array to group
     * @param {string} key - Key to group by
     * @returns {Object} Grouped object
     */
    groupBy(array, key) {
        return array.reduce((result, item) => {
            const groupKey = item[key];
            if (!result[groupKey]) result[groupKey] = [];
            result[groupKey].push(item);
            return result;
        }, {});
    }
};
