const colorMap = {
            'up-body': '#26a69a',
            'up-wick': '#26a69a',
            'up-border': '#26a69a',
            'down-body': '#ef5350',
            'down-wick': '#ef5350',
            'down-border': '#ef5350',
            'grid': '#2a2d3a',
            'background': '#0c0d14',
            'text': '#787b86'
        };

        const colors = {};
        Object.keys(colorMap).forEach(key => {
            const el = document.getElementById('ct-' + key);
            colors[key] = el ? el.value : colorMap[key];
        });
        return colors;
    }

    function getThemeName() {
        const input = document.getElementById('ct-theme-name');
        return input ? input.value.trim() || 'Untitled Theme' : 'Untitled Theme';
    }

    function addThemeToList() {
        const colors = getColors();
        const name = getThemeName();

        const themeColors = {
            candleUpBody: colors['up-body'],
            candleUpWick: colors['up-wick'],
            candleUpBorder: colors['up-border'],
            candleDownBody: colors['down-body'],
            candleDownWick: colors['down-wick'],
            candleDownBorder: colors['down-border'],
            gridColor: colors['grid'],
            backgroundColor: colors['background'],
            axisTextColor: colors['text']
        };

        if (window.ChartThemes) {
            const themeList = window.ChartThemes.getList();
            themeList.push({
                id: 'th-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
                name: name,
                colors: themeColors
            });
            window.ChartThemes.save();
            if (window.ChartThemes.renderPanel) {
                window.ChartThemes.renderPanel();
            }
            toast('Theme "' + name + '" added!', 'success');
            collapsePanel();
        }
    }

    function togglePanel() {
        const content = document.getElementById('ct-creator-content');
        const toggleBtn = document.getElementById('ct-creator-toggle');

        if (!content || !toggleBtn) return;

        isExpanded = !isExpanded;

        if (isExpanded) {
            content.style.display = 'flex';
            toggleBtn.innerHTML = `
                ${icon('chevron-up', 12)}
                <span style="font-size:9px; font-weight:500;">Theme Creator</span>
            `;
            setTimeout(() => {
                document.querySelectorAll('#ct-creator-content input[type="color"]').forEach(input => {
                    const hexInput = document.getElementById(input.id + '-hex');
                    if (hexInput) {
                        input.removeEventListener('input', () => syncHexWithColor(input.id));
                        hexInput.removeEventListener('input', () => syncColorWithHex(input.id));
                        input.addEventListener('input', () => syncHexWithColor(input.id));
                        hexInput.addEventListener('input', () => syncColorWithHex(input.id));
                        hexInput.addEventListener('blur', () => syncColorWithHex(input.id));
                    }
                });
            }, 50);
        } else {
            content.style.display = 'none';
            toggleBtn.innerHTML = `
                ${icon('chevron-down', 12)}
                <span style="font-size:9px; font-weight:500;">Theme Creator</span>
            `;
        }
        ensureIcons(50);
    }

    function collapsePanel() {
        isExpanded = false;
        const content = document.getElementById('ct-creator-content');
        const toggleBtn = document.getElementById('ct-creator-toggle');
        if (content) content.style.display = 'none';
        if (toggleBtn) {
            toggleBtn.innerHTML = `
                ${icon('chevron-down', 12)}
                <span style="font-size:9px; font-weight:500;">Theme Creator</span>
            `;
        }
        ensureIcons(50);
    }

    function injectCreatorButton() {
        if (injectAttempts >= MAX_ATTEMPTS) {
            return;
        }
        injectAttempts++;

        const panel = getPanelContent();
        if (!panel) {
            setTimeout(injectCreatorButton, 300);
            return;
        }

        if (document.getElementById('ct-creator-toggle')) return;

        const saveBtn = document.getElementById('ct-save-btn');
        if (!saveBtn) {
            setTimeout(injectCreatorButton, 300);
            return;
        }

        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'ct-creator-toggle';
        toggleBtn.className = 'btn';
        toggleBtn.style.cssText = `
            width:100%;
            justify-content:center;
            gap:3px;
            background:var(--bg-btn);
            border:1px solid var(--border-color);
            padding:4px 6px;
            margin-top:4px;
            border-radius:3px;
            font-size:9px;
            transition: all 0.15s ease;
            color: var(--text-main);
            height:24px;
        `;
        toggleBtn.innerHTML = `
            ${icon('chevron-down', 12)}
            <span style="font-size:9px; font-weight:500;">Theme Creator</span>
        `;
        toggleBtn.onmouseover = () => {
            toggleBtn.style.background = 'var(--border-color)';
        };
        toggleBtn.onmouseout = () => {
            toggleBtn.style.background = 'var(--bg-btn)';
        };
        toggleBtn.onclick = togglePanel;

        const content = document.createElement('div');
        content.id = 'ct-creator-content';
        content.style.cssText = `
            display:none;
            flex-direction:column;
            gap:3px;
            padding:6px 3px;
            border-top:1px solid var(--border-color);
            margin-top:4px;
            background:var(--bg-input);
            border-radius:3px;
            max-height:220px;
            overflow-y:auto;
        `;

        content.innerHTML = `
            <div style="display:flex; gap:4px; align-items:center; padding:0 2px;">
                <span style="font-size:8px; color:var(--text-muted); width:30px; flex-shrink:0;">Name</span>
                <input type="text" id="ct-theme-name" placeholder="My Theme"
                       style="flex:1; background:var(--bg-input); border:1px solid var(--border-color); color:var(--text-main); border-radius:2px; padding:2px 4px; font-size:9px; outline:none; height:20px;">
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:2px 4px; padding:2px 0;">
                <div style="display:flex; flex-direction:column; gap:1px;">
                    <span style="font-size:7px; color:var(--accent-green); text-transform:uppercase; letter-spacing:0.2px; font-weight:600; display:flex; align-items:center; gap:2px;">
                        ${icon('trending-up', 8)} Up
                    </span>
                    ${createColorRow('B', 'ct-up-body', '#26a69a')}
                    ${createColorRow('W', 'ct-up-wick', '#26a69a')}
                    ${createColorRow('Bo', 'ct-up-border', '#26a69a')}
                </div>
                <div style="display:flex; flex-direction:column; gap:1px;">
                    <span style="font-size:7px; color:var(--accent-red); text-transform:uppercase; letter-spacing:0.2px; font-weight:600; display:flex; align-items:center; gap:2px;">
                        ${icon('trending-down', 8)} Down
                    </span>
                    ${createColorRow('B', 'ct-down-body', '#ef5350')}
                    ${createColorRow('W', 'ct-down-wick', '#ef5350')}
                    ${createColorRow('Bo', 'ct-down-border', '#ef5350')}
                </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:1px 4px; padding:1px 0;">
                ${createColorRow('Grid', 'ct-grid', '#2a2d3a')}
                ${createColorRow('Back', 'ct-background', '#0c0d14')}
                ${createColorRow('Text', 'ct-text', '#787b86')}
            </div>

            <button onclick="window.ThemeCreator.addTheme()"
                    style="background:var(--accent-blue); border:none; color:#fff; border-radius:3px; padding:3px; font-size:9px; font-weight:600; cursor:pointer; margin-top:2px; display:flex; align-items:center; justify-content:center; gap:3px; height:22px; transition:all 0.15s ease;">
                ${icon('plus', 10)} Add Theme
            </button>
        `;

        panel.insertBefore(toggleBtn, saveBtn);
        panel.insertBefore(content, saveBtn);

        ensureIcons(50);
    }

    const origShowPanel = window.ChartThemes ? window.ChartThemes.showPanel : null;
    if (origShowPanel) {
        window.ChartThemes.showPanel = function() {
            origShowPanel.call(window.ChartThemes);
            injectAttempts = 0;
            setTimeout(injectCreatorButton, 400);
        };
    }

    window.ThemeCreator = {
        toggle: togglePanel,
        collapse: collapsePanel,
        addTheme: addThemeToList,
        getColors: getColors,
        inject: injectCreatorButton
    };

    document.addEventListener('click', function(e) {
        const target = e.target.closest('#btn-advanced-theme');
        if (target) {
            injectAttempts = 0;
            setTimeout(injectCreatorButton, 400);
        }
    });

})();

const Engine = (function() {
    let maxVisible = 20000;
    let timeframe = 1;
    let buffer = [];
    let rawHistory = [];
    let cursorTime = null;
    let dataFile = null;
    let fetching = false;
    let ended = false;

    let aggregated = [];
    let viewport = [];
    let replayCursor = 0;
    let currentLiveBar = null;

    let isPlaying = false;
    let playInterval = null;
    let currentSpeed = 1000;

    let tvWidget = null;
    let realtimeCallback = null;
    let currentListenerId = null;

    let currentBalance = 1000;
    let initialBalance = 1000;
    let activePositions = [];
    let pendingOrders = [];
    let tradeJournal = [];
    let currentSymbol = "SIMULATION";
    let currentPriceDecimals = 5;

    let lastFetchTime = 0;
    let consecutiveEmptyFetches = 0;
    const MAX_EMPTY_FETCHES = 3;
	const MAX_HISTORY = 50000;
    const TRIM_BATCH = 1000;

    const domCache = {};

    function getEl(id) {
        let el = domCache[id];
        if (el && document.body.contains(el)) return el;
        el = document.getElementById(id);
        domCache[id] = el;
        return el;
    }

    function getPriceDecimals() { return currentPriceDecimals; }
    function getPricescaleForSymbol() { return Math.pow(10, currentPriceDecimals); }

    function refreshIcons() {
        if (window.lucide && typeof lucide.createIcons === 'function') {
            try { lucide.createIcons(); } catch (e) {}
        }
    }

    function resetEngine() {
        buffer = [];
        rawHistory = [];
        cursorTime = null;
        ended = false;
        fetching = false;
        aggregated = [];
        viewport = [];
        replayCursor = 0;
        currentLiveBar = null;
        lastFetchTime = 0;
        consecutiveEmptyFetches = 0;
    }

    async function refillBuffer() {
        if (fetching || buffer.length > 2000 || !dataFile || ended) return;

        const now = Date.now();
        if (buffer.length > 0 && now - lastFetchTime < 1000) return;
        lastFetchTime = now;

        fetching = true;
        try {
            const queryTime = (cursorTime !== null && !isNaN(cursorTime) && cursorTime > 0) ? Number(cursorTime) : 0;
            const response = await fetch(`http://localhost:8000/api/bars?file=${dataFile}&from=${queryTime}&resolution=1&countBack=5000`);

            if (!response.ok) throw new Error("Network response error");

            let bars = [];
            const contentType = response.headers.get("content-type") || "";

            function parseCSVLine(line) {
                if (typeof line !== 'string' || !line.trim()) return null;
                const parts = line.split(",");
                if (parts.length < 5) return null;

                const timeMs = new Date(parts[0].trim()).getTime();
                if (isNaN(timeMs)) return null;

                return {
                    time: timeMs,
                    open: parseFloat(parts[1]),
                    high: parseFloat(parts[2]),
                    low: parseFloat(parts[3]),
                    close: parseFloat(parts[4]),
                    volume: parts[5] ? parseFloat(parts[5]) : 0
                };
            }

            if (contentType.includes("application/json")) {
                const data = await response.json();
                if (Array.isArray(data)) {
                    bars = data.map(item => typeof item === 'string' ? parseCSVLine(item) : item).filter(Boolean);
                } else if (data.bars && Array.isArray(data.bars)) {
                    bars = data.bars.map(item => typeof item === 'string' ? parseCSVLine(item) : item).filter(Boolean);
                }
            } else {
                const textData = await response.text();
                const lines = textData.split("\n");
                bars = lines.map(parseCSVLine).filter(Boolean);
            