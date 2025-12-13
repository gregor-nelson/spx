// =============================================================================
// SPX Options Monitor - Utility Functions
// =============================================================================

const Utils = {
    /**
     * Format date as "3rd Dec" style
     * @param {string} dateStr - Date string in YYYY-MM-DD format
     * @returns {string} Formatted date string
     */
    formatShortDate(dateStr) {
        if (!dateStr) return dateStr;
        const date = new Date(dateStr + 'T00:00:00');
        const day = date.getDate();
        const month = date.toLocaleString('en-US', { month: 'short' });

        // Add ordinal suffix
        const suffix = (day === 1 || day === 21 || day === 31) ? 'st'
            : (day === 2 || day === 22) ? 'nd'
            : (day === 3 || day === 23) ? 'rd'
            : 'th';

        return `${day}${suffix} ${month}`;
    },

    /**
     * Format number with locale separators
     * @param {number} n - Number to format
     * @returns {string} Formatted number or '-' if null/undefined
     */
    formatNumber(n) {
        if (n === null || n === undefined) return '-';
        return n.toLocaleString();
    },

    /**
     * Format number as currency
     * @param {number} n - Number to format
     * @returns {string} Formatted currency string or '-' if null/undefined
     */
    formatMoney(n) {
        if (n === null || n === undefined) return '-';
        return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    /**
     * Format number as percentage
     * @param {number} n - Number to format (0.1 = 10%)
     * @returns {string} Formatted percentage string or '-' if null/undefined
     */
    formatPercent(n) {
        if (n === null || n === undefined) return '-';
        return (n * 100).toFixed(1) + '%';
    }
};
