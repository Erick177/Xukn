ontrol-input {
            background: #f4f5f7 !important;
            color: #1c1e21 !important;
            border-color: #d2d6dc !important;
        }
        body.light-theme .modal-header span,
        body.light-theme .field-label {
            color: #1c1e21 !important;
        }
        body.light-theme #sidebar-panel {
            background: rgba(255,255,255,0.0) !important;
        }
        body.light-theme #balance-row {
            background: #f4f5f7 !important;
        }
        body.light-theme .position-card {
            background: #f4f5f7 !important;
        }
        body.light-theme .position-card:hover {
            background: #e4e6eb !important;
        }
        body.light-theme #floating-control-bar {
            background: rgba(255,255,255,0.0) !important;
        }
        .swal-dark-popup {
            border: 1px solid var(--border-color) !important;
            border-radius: 10px !important;
        }
        .swal2-title {
            color: var(--text-main) !important;
            font-size: 15px !important;
        }
        .swal2-html-container {
            color: var(--text-muted) !important;
            font-size: 12px !important;
        }
        .swal-confirm, .swal-cancel {
            border-radius: 4px !important;
            font-size: 12px !important;
            font-weight: 600 !important;
            height: 30px !important;
            padding: 0 14px !important;
        }
        .swal-cancel {
            color: var(--text-main) !important;
            border: 1px solid var(--border-color) !important;
        }
        .swal-input {
            background: var(--bg-input) !important;
            border: 1px solid var(--border-color) !important;
            color: var(--text-main) !important;
            border-radius: 4px !important;
            font-size: 12px !important;
        }
    `;
    document.head.appendChild(style);
})();

let _patchedTheme = 'dark';

(function patchTVWidget() {
    const origTV = window.TradingView;
    if (!origTV || !origTV.widget) return;

    const OrigWidget = origTV.widget;
    origTV.widget = function(config) {
        config.theme = _patchedTheme === 'dark' ? 'Dark' : 'Light';
        const instance = new OrigWidget(config);
        window._tvWidgetRef = instance;
        return instance;
    };
})();

function toggleChartTheme() {
    const newTheme = _patchedTheme === 'dark' ? 'light' : 'dark';
    _patchedTheme = newTheme;

    if (newTheme === 'light') {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
    }

    const tvW = window._tvWidgetRef;
    if (tvW && typeof tvW.changeTheme === 'function') {
        tvW.changeTheme(newTheme === 'dark' ? 'Dark' : 'Light');
    }

    if (window.ChartThemes && window.ChartThemes.updateThemeButton) {
        window.ChartThemes.updateThemeButton();
    }

    ensureIcons(100);
}

function patchEngine() {
    if (!window.Engine || window.Engine.__uiPatched) return;
    window.Engine.__uiPatched = true;

    const origToggleTrade = Engine.toggleTradePanel;
    if (origToggleTrade) {
        Engine.toggleTradePanel = function() {
            origToggleTrade.call(this);
            ensureIcons(50);
        };
    }

    const origShowHistory = Engine.showHistoryModal;
    if (origShowHistory) {
        Engine.showHistoryModal = function() {
            origShowHistory.call(this);
            ensureIcons(50);
        };
    }
}

function tryPatchAll() {
    patchSessionManager();
    patchEngine();
}

(function fixTimeJumps() {
    window.normalizeTimestamp = function(timestamp, timeframeInMinutes = 60) {
        const timeframeMs = timeframeInMinutes * 60 * 1000;
        return Math.floor(timestamp / timeframeMs) * timeframeMs;
    };

    const patchEngineData = setInterval(() => {
        if (window.Engine) {
            if (!window.Engine.__timePatch) {
                window.Engine.__timePatch = true;

                const origLoad = window.Engine.loadSessionData || window.Engine.loadSession;
                if (origLoad) {
                    const targetFunc = window.Engine.loadSessionData ? 'loadSessionData' : 'loadSession';
                    window.Engine[targetFunc] = function(sessionJson) {
                        if (sessionJson) {
                            if (sessionJson.trades && sessionJson.trades.length > 0) {
                                const lastTrade = sessionJson.trades[sessionJson.trades.length - 1];
                                const lastTradeTime = new Date(lastTrade.Date).getTime();
                                if (sessionJson.currentTimestamp > lastTradeTime + (7 * 24 * 60 * 60 * 1000)) {
                                    sessionJson.currentTimestamp = lastTradeTime;
                                }
                            }
                            if (sessionJson.currentTimestamp) {
                                const tf = sessionJson.timeframe || 60;
                                sessionJson.currentTimestamp = window.normalizeTimestamp(sessionJson.currentTimestamp, tf);
                            }
                        }
                        return origLoad.call(this, sessionJson);
                    };
                }
            }
            clearInterval(patchEngineData);
        }
    }, 500);
})();

function bindShortcuts() {
    if (!window.Mousetrap) return;

    try {
        Mousetrap.bind('space', function(e) {
            e.preventDefault();
            if (window.Engine) window.Engine.togglePlay();
        });

        Mousetrap.bind('right', function(e) {
            e.preventDefault();
            if (window.Engine) window.Engine.stepForward();
        });

        Mousetrap.bind('b', function() {
            if (window.Engine) window.Engine.createOrder('BUY');
        });

        Mousetrap.bind('s', function() {
            if (window.Engine) window.Engine.createOrder('SELL');
        });

        Mousetrap.bind('o', function() {
            if (window.Engine) {
                window.Engine.toggleTradePanel();
                ensureIcons(50);
            }
        });

        Mousetrap.bind('d', function() {
            if (window.SessionManager) {
                window.SessionManager.showDashboard();
                ensureIcons(100);
            }
        });

        Mousetrap.bind('j', function() {
            if (window.Engine) {
                window.Engine.showHistoryModal();
                ensureIcons(50);
            }
        });

        Mousetrap.bind('t', function() {
            toggleChartTheme();
        });

        Mousetrap.bind('esc', function() {
            document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
        });
    } catch (e) {
        console.warn('Shortcut binding error:', e);
    }
}

document.addEventListener('click', function(e) {
    const target = e.target.closest('[onclick]');
    if (target) {
        const onclickAttr = target.getAttribute('onclick') || '';
        const keywords = ['Dashboard', 'Notes', 'Journal', 'Order', 'theme', 'toggle', 'modal'];
        if (keywords.some(k => onclickAttr.includes(k))) {
            ensureIcons(150);
        }
    }
});

function setupIconObserver() {
    let pending = false;

    const observer = new MutationObserver(function(mutations) {
        if (pending) return;
        let shouldRefresh = false;
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1) {
                        if ((node.querySelector && node.querySelector('[data-lucide]')) ||
                            (node.hasAttribute && node.hasAttribute('data-lucide'))) {
                            shouldRefresh = true;
                            break;
                        }
                    }
                }
            }
            if (shouldRefresh) break;
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const el = mutation.target;
                if (el.classList && (el.classList.contains('modal-overlay') || el.id === 'dashboard-overlay')) {
                    shouldRefresh = true;
                    break;
                }
            }
        }
        if (shouldRefresh) {
            pending = true;
            ensureIcons(50);
            setTimeout(() => { pending = false; }, 300);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
    });
}

(function ChartThemes() {
    const DEFAULT_COLORS = {
        backgroundColor: '#0c0d14',
        gridColor: '#2a2d3a',
        candleUpBody: '#26a69a',
        candleDownBody: '#ef5350',
        candleUpWick: '#26a69a',
        candleDownWick: '#ef5350',
        candleUpBorder: '#26a69a',
        candleDownBorder: '#ef5350',
        axisTextColor: '#787b86'
    };

    let themeList = [];
    let currentColors = { ...DEFAULT_COLORS };
    let isDirty = false;
    let panelWrapper = null;

    function getWidget() {
        if (window._tvWidgetRef) return window._tvWidgetRef;
        if (window.Engine && window.Engine._internal && window.Engine._internal.getWidget) {
            return window.Engine._internal.getWidget();
        }
        return null;
    }

    function genId() {
        return 'th-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    }

    function toast(msg, type = 'info') {
        if (!window.Swal) return;
        Swal.mixin({
            toast: true,
            position: 'bottom',
            showConfirmButton: false,
            timer: 1500,
            background: 'var(--bg-panel, #161a25)',
            color: 'var(--text-main, #d1d4dc)'
        }).fire({ icon: type, title: msg });
    }

    function applyColors(colors, { silent = false } = {}) {
        const widget = getWidget();
        if (!widget) { setTimeout(() => applyColors(colors, { silent }), 500); return; }
        try {
            const chart = widget.activeChart();
            if (!chart) return;
            chart.applyOverrides({
                'paneProperties.background': colors.backgroundColor || DEFAULT_COLORS.backgroundColor,
                'paneProperties.vertGridColor': colors.gridColor || DEFAULT_COLORS.gridColor,
                'paneProperties.horzGridColor': colors.gridColor || DEFAULT_COLORS.gridColor,
                'mainSeriesProperties.candleStyle.upColor': colors.candleUpBody || DEFAULT_COLORS.candleUpBody,
                'mainSeriesProperties.candleStyle.downColor': colors.candleDownBody || DEFAULT_COLORS.candleDownBody,
                'mainSeriesProperties.candleStyle.wickUpColor': colors.candleUpWick || DEFAULT_COLORS.candleUpWick,
                'mainSeriesProperties.candleStyle.wickDownColor': colors.candleDownWick || DEFAULT_COLORS.candleDownWick,
                'mainSeriesProperties.candleStyle.borderUpColor': colors.candleUpBorder || DEFAULT_COLORS.candleUpBorder,
                'mainSeriesProperties.candleStyle.borderDownColor': colors.candleDownBorder || DEFAULT_COLORS.candleDownBorder,
                'scalesProperties.textColor': colors.axisTextColor || DEFAULT_COLORS.axisTextColor,
                'timeScale.textColor': colors.axisTextColor || DEFAULT_COLORS.axisTextColor
            });
            currentColors = { ...DEFAULT_COLORS, ...colors };
            if (!silent) toast('Theme applied', 'success');
        } catch (e) {
            console.error('applyColors error:', e);
        }
    }

    async function loadThemeList() {
        try {
            const res = await fetch('/src/theme.json');
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) { themeList = data; return; }
                if (data && Array.isArray(data.themes)) { themeList = data.themes; return; }
            }
        } catch (e) {}
        themeList = [];
    }

    async function saveThemeList() {
        try {
            const res = await fetch('/save_theme', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ themes: themeList, updatedAt: new Date().toISOString() })
            });
            if (res.ok) {
                isDirty = false;
                toast('Saved to theme.json', 'success');
                renderPanel();
            } else {
                toast('Save failed', 'error');
            }
        } catch (e) {
            toast('Save failed', 'error');
        }
    }

    function addCurrentAsTheme() {
        Swal.fire({
            title: 'Save current chart theme',
            input: 'text',
            inputPlaceholder: 'Theme name',
            showCancelButton: true,
            confirmButtonText: 'Save',
            background: 'var(--bg-panel, #161a25)',
            color: 'var(--text-main, #d1d4dc)',
            inputValidator: (v) => (!v || !v.trim()) ? 'Enter a name' : undefined
        }).then(res