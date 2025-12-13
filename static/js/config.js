// =============================================================================
// SPX Options Monitor - Configuration
// ECharts theme and shared settings
// =============================================================================

const Config = {
    // =========================================================================
    // API Configuration
    // =========================================================================
    // Base path for API calls - change this when deploying behind a reverse proxy
    // Examples: '' for root, '/spx' for path-based routing
    apiBase: '',

    // =========================================================================
    // Theme Colors (matching CSS variables)
    // =========================================================================
    theme: {
        // Backgrounds
        bgPrimary: '#0b0e14',
        bgSecondary: '#121820',
        bgTertiary: '#1a2332',
        bgElevated: '#232d3f',

        // Borders
        border: '#2a3544',
        borderBright: '#3d4f66',

        // Text
        text: '#e6edf5',
        textSecondary: '#8b9eb3',
        textMuted: '#5a6b7d',

        // Trading Colors
        positive: '#00d4aa',
        positiveDim: 'rgba(0, 212, 170, 0.15)',
        negative: '#ff4757',
        negativeDim: 'rgba(255, 71, 87, 0.15)',
        neutral: '#ffa502',
        neutralDim: 'rgba(255, 165, 2, 0.15)',

        // Accent
        accent: '#3b82f6',
        accentDim: 'rgba(59, 130, 246, 0.2)',
        accentPurple: '#a855f7',

        // Chart palette
        chartColors: [
            '#3b82f6',  // Blue
            '#00d4aa',  // Teal
            '#f59e0b',  // Amber
            '#a855f7',  // Purple
            '#ef4444',  // Red
            '#06b6d4',  // Cyan
            '#10b981',  // Green
            '#ec4899',  // Pink
        ]
    },

    // =========================================================================
    // ECharts Base Options
    // =========================================================================
    echartsBase: {
        backgroundColor: 'transparent',
        textStyle: {
            fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
            color: '#8b9eb3'
        },
        title: {
            textStyle: {
                fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                fontSize: 13,
                fontWeight: 600,
                color: '#8b9eb3'
            },
            left: 0,
            top: 0
        },
        grid: {
            left: 50,
            right: 20,
            top: 40,
            bottom: 40,
            containLabel: false
        },
        tooltip: {
            backgroundColor: 'rgba(18, 24, 32, 0.95)',
            borderColor: '#2a3544',
            borderWidth: 1,
            textStyle: {
                fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                fontSize: 12,
                color: '#e6edf5'
            },
            extraCssText: 'box-shadow: 0 4px 20px rgba(0,0,0,0.3); backdrop-filter: blur(8px);'
        },
        legend: {
            textStyle: {
                fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                fontSize: 11,
                color: '#5a6b7d'
            },
            itemGap: 16,
            itemWidth: 16,
            itemHeight: 10
        }
    },

    // =========================================================================
    // ECharts Axis Configuration
    // =========================================================================
    xAxis: {
        axisLine: {
            lineStyle: { color: '#2a3544', width: 1 }
        },
        axisTick: {
            lineStyle: { color: '#2a3544' },
            length: 4
        },
        axisLabel: {
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 10,
            color: '#5a6b7d'
        },
        splitLine: {
            lineStyle: { color: 'rgba(42, 53, 68, 0.5)', type: 'dashed' }
        },
        nameTextStyle: {
            fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
            fontSize: 11,
            color: '#5a6b7d'
        }
    },

    yAxis: {
        axisLine: {
            lineStyle: { color: '#2a3544', width: 1 }
        },
        axisTick: {
            lineStyle: { color: '#2a3544' },
            length: 4
        },
        axisLabel: {
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 10,
            color: '#5a6b7d'
        },
        splitLine: {
            lineStyle: { color: 'rgba(42, 53, 68, 0.5)', type: 'dashed' }
        },
        nameTextStyle: {
            fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
            fontSize: 11,
            color: '#5a6b7d'
        }
    },

    // =========================================================================
    // Color Scales
    // =========================================================================
    colorScales: {
        // Volume heatmap (blue to orange)
        volume: [
            [0, '#121820'],
            [0.1, '#1a2332'],
            [0.25, '#1e3a5f'],
            [0.4, '#2563a8'],
            [0.55, '#3b82f6'],
            [0.7, '#b87a14'],
            [0.85, '#ffa502'],
            [1, '#ff6b35']
        ],

        // Change heatmap (blue to red, diverging)
        change: [
            [0, '#1e5a9e'],
            [0.25, '#3b82c4'],
            [0.4, '#4a6a85'],
            [0.5, '#2a3544'],
            [0.6, '#7a6045'],
            [0.75, '#b87a14'],
            [0.9, '#c45a28'],
            [1, '#ff4757']
        ],

        // IV surface (blue to red)
        iv: [
            [0, '#1e3a5f'],
            [0.2, '#2563a8'],
            [0.4, '#3b82f6'],
            [0.5, '#4a8a6a'],
            [0.6, '#00d4aa'],
            [0.75, '#ffa502'],
            [0.9, '#c45a28'],
            [1, '#ff4757']
        ],

        // Z-score (blue = cheap, red = expensive)
        zscore: [
            [0, '#1e5a9e'],
            [0.17, '#3b82c4'],
            [0.33, '#6a9bc4'],
            [0.5, '#4a5568'],
            [0.67, '#c49a6a'],
            [0.83, '#c45a28'],
            [1, '#ff4757']
        ]
    },

    // =========================================================================
    // 3D Scene Configuration
    // =========================================================================
    scene3D: {
        viewControl: {
            alpha: 25,
            beta: 45,
            distance: 200,
            autoRotate: false,
            animation: true
        },
        light: {
            main: {
                intensity: 1.1,
                shadow: true,
                shadowQuality: 'high',
                alpha: 40,
                beta: 50
            },
            ambient: { intensity: 0.4 }
        },
        postEffect: {
            enable: true,
            bloom: { enable: true, intensity: 0.08 },
            SSAO: { enable: true, radius: 3, intensity: 1 }
        }
    }
};

// Freeze config to prevent modifications
Object.freeze(Config);
Object.freeze(Config.theme);
Object.freeze(Config.echartsBase);
Object.freeze(Config.colorScales);
