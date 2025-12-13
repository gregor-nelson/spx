// =============================================================================
// SPX Options Monitor - Configuration (IBKR Theme)
// =============================================================================

const Config = {
    // =========================================================================
    // Theme colors matching CSS variables (IBKR Dark Theme - exact values)
    // =========================================================================
    theme: {
        // IBKR Neutral backgrounds
        neutral0: '#16171f',      // hsla(220, 17%, 10%)
        neutral3: '#1d1f26',      // hsla(220, 13%, 13%)
        neutral5: '#222428',      // hsla(217, 11%, 15%)
        neutral10: '#2f3138',     // hsla(225, 8%, 20%)
        neutral20: '#434650',     // hsla(223, 5%, 28%)
        neutral30: '#575a62',     // hsla(220, 5%, 36%)
        // Background aliases
        bgBody: '#16161f',        // hsla(240, 17%, 10%)
        bgBodyLight: '#222a3a',   // hsla(221, 22%, 17%)
        bgDarkest: '#16171f',
        bgPrimary: '#16161f',
        bgSecondary: '#222a3a',
        bgTertiary: '#2f3138',
        bgHover: '#434650',
        // Borders
        border: '#484a57',        // hsla(240, 7%, 30%)
        borderLight: '#575a62',
        // IBKR Text colors
        fontColor: '#d6d6d6',     // hsla(0, 0%, 84%)
        fontColorLight: '#b8b8b8', // hsla(0, 0%, 72%)
        fontColorDark: '#ffffff',
        thColor: '#6b7684',       // hsla(208, 7%, 46%)
        // Aliases
        textPrimary: '#d6d6d6',
        textSecondary: '#b8b8b8',
        textMuted: '#6b7684',
        textHeading: '#ffffff',
        // IBKR Primary (Brand Red)
        primary: '#da1b2c',       // hsla(355, 85%, 46%)
        primaryHover: '#e5394a',  // hsla(355, 85%, 51%)
        primaryActive: '#eb5765', // hsla(355, 85%, 56%)
        // IBKR Semantic Colors
        info: '#3b82f6',          // hsla(216, 88%, 57%)
        success: '#0fb359',       // hsla(148, 85%, 38%)
        warning: '#ffaa00',       // hsla(42, 100%, 50%)
        danger: '#ff334d',        // hsla(355, 100%, 60%)
        // Legacy aliases
        accentBrand: '#da1b2c',
        accentBlue: '#3b82f6',
        accentGreen: '#0fb359',
        accentRed: '#ff334d',
        accentOrange: '#ffaa00',
        accentPurple: '#a855f7'
    },

    // =========================================================================
    // Plotly dark theme layout (IBKR Style - refined)
    // =========================================================================
    plotlyLayout: {
        paper_bgcolor: '#222a3a',  // theme.bgSecondary
        plot_bgcolor: '#222a3a',
        font: {
            color: '#d6d6d6',
            family: "'Source Sans Pro', 'Proxima Nova', Arial, sans-serif",
            size: 12
        },
        // IBKR-styled tooltip/hoverlabel - refined with subtle shadow effect
        hoverlabel: {
            bgcolor: '#222428',    // theme.neutral5
            bordercolor: '#575a62', // theme.neutral30
            font: {
                family: "'Source Sans Pro', 'Proxima Nova', Arial, sans-serif",
                size: 12,
                color: '#d6d6d6'
            },
            align: 'left',
            namelength: -1  // Show full trace name
        },
        // Title styling
        title: {
            font: {
                family: "'Source Sans Pro', 'Proxima Nova', Arial, sans-serif",
                size: 13,
                color: '#b8b8b8'   // theme.textSecondary
            },
            x: 0,
            xanchor: 'left',
            y: 0.98,
            yanchor: 'top'
        },
        // Legend styling - compact IBKR style
        legend: {
            bgcolor: 'rgba(0,0,0,0)',
            bordercolor: '#484a57', // theme.border
            borderwidth: 0,
            font: {
                family: "'Source Sans Pro', 'Proxima Nova', Arial, sans-serif",
                size: 10,
                color: '#6b7684'   // theme.textMuted
            },
            orientation: 'h',
            x: 0,
            y: -0.12,
            tracegroupgap: 8
        },
        xaxis: {
            // IBKR: Very subtle grids, almost invisible
            gridcolor: 'rgba(72, 74, 87, 0.3)',  // theme.border at 30% opacity
            gridwidth: 0.5,
            showgrid: true,
            // Axis line more prominent than grid
            linecolor: '#484a57',  // theme.border
            linewidth: 1,
            showline: true,
            // Zero line styling
            zerolinecolor: '#575a62', // theme.neutral30
            zerolinewidth: 1,
            // Ticks - small outside ticks like IBKR TWS
            ticks: 'outside',
            ticklen: 3,
            tickwidth: 1,
            tickcolor: '#484a57',
            tickfont: {
                family: "'Source Sans Pro', 'Proxima Nova', Arial, sans-serif",
                size: 10,
                color: '#6b7684'   // theme.textMuted
            },
            title: {
                font: {
                    family: "'Source Sans Pro', 'Proxima Nova', Arial, sans-serif",
                    size: 11,
                    color: '#6b7684'
                },
                standoff: 8
            },
            // Crosshair spike line
            showspikes: true,
            spikecolor: '#575a62',
            spikethickness: 1,
            spikedash: 'dot',
            spikemode: 'across'
        },
        yaxis: {
            // IBKR: Very subtle grids
            gridcolor: 'rgba(72, 74, 87, 0.3)',
            gridwidth: 0.5,
            showgrid: true,
            // Axis line
            linecolor: '#484a57',
            linewidth: 1,
            showline: true,
            // Zero line
            zerolinecolor: '#575a62',
            zerolinewidth: 1,
            // Ticks
            ticks: 'outside',
            ticklen: 3,
            tickwidth: 1,
            tickcolor: '#484a57',
            tickfont: {
                family: "'Source Sans Pro', 'Proxima Nova', Arial, sans-serif",
                size: 10,
                color: '#6b7684'
            },
            title: {
                font: {
                    family: "'Source Sans Pro', 'Proxima Nova', Arial, sans-serif",
                    size: 11,
                    color: '#6b7684'
                },
                standoff: 8
            },
            // Crosshair spike line
            showspikes: true,
            spikecolor: '#575a62',
            spikethickness: 1,
            spikedash: 'dot',
            spikemode: 'across'
        },
        margin: { t: 32, r: 12, b: 38, l: 48 },
        // Crosshair settings
        hovermode: 'closest',
        spikedistance: -1
    },

    // =========================================================================
    // Plotly config options
    // =========================================================================
    plotlyConfig: {
        responsive: true,
        displayModeBar: false
    }
};
