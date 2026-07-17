ult => {
            if (!result.isConfirmed) return;
            themeList.push({ id: genId(), name: result.value.trim(), colors: { ...currentColors } });
            isDirty = true;
            renderPanel();
        });
    }

    function renameTheme(id) {
        const t = themeList.find(x => x.id === id);
        if (!t) return;
        Swal.fire({
            title: 'Rename theme',
            input: 'text',
            inputValue: t.name,
            showCancelButton: true,
            confirmButtonText: 'Save',
            background: 'var(--bg-panel, #161a25)',
            color: 'var(--text-main, #d1d4dc)',
            inputValidator: (v) => (!v || !v.trim()) ? 'Enter a name' : undefined
        }).then(result => {
            if (!result.isConfirmed) return;
            t.name = result.value.trim();
            isDirty = true;
            renderPanel();
        });
    }

    function deleteTheme(id) {
        Swal.fire({
            title: 'Delete this theme?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Delete',
            confirmButtonColor: '#ef5350',
            background: 'var(--bg-panel, #161a25)',
            color: 'var(--text-main, #d1d4dc)'
        }).then(result => {
            if (!result.isConfirmed) return;
            themeList = themeList.filter(x => x.id !== id);
            isDirty = true;
            renderPanel();
        });
    }

    function applyThemeById(id) {
        const t = themeList.find(x => x.id === id);
        if (!t) return;
        applyColors(t.colors);
        renderPanel();
    }

    function renderPanel() {
        const list = document.getElementById('ct-list');
        if (!list) return;

        if (themeList.length === 0) {
            list.innerHTML = `<div style="text-align:center; padding:16px; color:var(--text-muted); font-size:11px;">No saved themes yet</div>`;
        } else {
            list.innerHTML = themeList.map(t => `
                <div style="display:flex; align-items:center; gap:6px; padding:6px 8px; background:var(--bg-input); border-radius:5px; border:1px solid var(--border-color);">
                    <span style="display:flex; gap:2px; flex-shrink:0;">
                        <span style="width:9px;height:9px;border-radius:2px;background:${t.colors.candleUpBody};"></span>
                        <span style="width:9px;height:9px;border-radius:2px;background:${t.colors.candleDownBody};"></span>
                        <span style="width:9px;height:9px;border-radius:2px;background:${t.colors.backgroundColor};border:1px solid var(--border-color);"></span>
                    </span>
                    <span style="flex:1; font-size:11px; cursor:pointer;" onclick="window.ChartThemes.apply('${t.id}')" title="Click to apply">${t.name}</span>
                    <button onclick="window.ChartThemes.rename('${t.id}')" title="Rename"
                            style="background:none;border:none;color:var(--text-muted);cursor:pointer;display:flex;padding:0 2px;">
                        <i data-lucide="pencil" style="width:11px;height:11px;"></i>
                    </button>
                    <button onclick="window.ChartThemes.remove('${t.id}')" title="Delete"
                            style="background:none;border:none;color:var(--text-muted);cursor:pointer;display:flex;padding:0 2px;">
                        <i data-lucide="trash-2" style="width:11px;height:11px;"></i>
                    </button>
                </div>
            `).join('');
        }

        const saveBtn = document.getElementById('ct-save-btn');
        if (saveBtn) saveBtn.style.opacity = isDirty ? '1' : '0.55';

        ensureIcons(30);
    }

    function updateThemeButton() {
        const btn = document.getElementById('ct-theme-toggle-btn');
        if (!btn) return;
        const isDark = _patchedTheme === 'dark';
        btn.innerHTML = isDark
            ? '<i data-lucide="sun" style="width:12px;height:12px;"></i>'
            : '<i data-lucide="moon" style="width:12px;height:12px;"></i>';
        ensureIcons(50);
    }

    function showPanel() {
        if (document.getElementById('ct-wrapper')) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'ct-wrapper';
        wrapper.style.cssText = 'position:fixed; inset:0; background:rgba(8,9,14,0.85); backdrop-filter:blur(4px); z-index:9998; display:flex; align-items:center; justify-content:center;';

        wrapper.innerHTML = `
            <div style="background:var(--bg-panel); border:1px solid var(--border-color); border-radius:12px; padding:18px; width:320px; max-width:95vw; box-shadow:0 16px 48px rgba(0,0,0,.8); display:flex; flex-direction:column; gap:14px;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:10px;">
                    <span style="font-size:14px; font-weight:700; display:flex; align-items:center; gap:6px; color:#fbbf24;">
                        <i data-lucide="palette" style="width:16px;height:16px;"></i> Theme Manager
                    </span>
                    <button onclick="window.ChartThemes.close()" style="background:none; border:none; color:var(--text-muted); cursor:pointer; display:flex; padding:4px;">
                        <i data-lucide="x" style="width:16px;height:16px;"></i>
                    </button>
                </div>

                <div style="display:flex; gap:6px; align-items:center; justify-content:space-between; background:var(--bg-input); padding:6px 10px; border-radius:6px; border:1px solid var(--border-color);">
                    <span style="font-size:11px; color:var(--text-muted);">Toggle Theme</span>
                    <button id="ct-theme-toggle-btn" class="btn" onclick="toggleChartTheme()"
                            style="width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; background:var(--bg-btn); border:1px solid var(--border-color); border-radius:4px;">
                        <i data-lucide="${_patchedTheme === 'dark' ? 'sun' : 'moon'}" style="width:14px;height:14px;"></i>
                    </button>
                </div>

                <div style="display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.04em;">Saved Themes</span>
                        <button onclick="window.ChartThemes.addCurrent()"
                                style="background:var(--accent-blue); border:none; color:#fff; border-radius:4px; padding:2px 8px; font-size:10px; cursor:pointer; display:flex; align-items:center; gap:3px;">
                            <i data-lucide="plus" style="width:10px;height:10px;"></i> Add Current
                        </button>
                    </div>
                    <div id="ct-list" style="display:flex; flex-direction:column; gap:5px; max-height:200px; overflow-y:auto; padding-right:2px;"></div>
                </div>

                <button id="ct-save-btn" onclick="window.ChartThemes.save()"
                        style="width:100%; background:var(--accent-green); border:none; color:#021a17; border-radius:6px; padding:8px; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                    <i data-lucide="save" style="width:13px;height:13px;"></i> Save All to theme.json
                </button>
            </div>
        `;

        wrapper.addEventListener('click', (e) => { if (e.target === wrapper) closePanel(); });
        document.body.appendChild(wrapper);
        panelWrapper = wrapper;
        renderPanel();
        updateThemeButton();
        ensureIcons(50);
    }

    function closePanel() {
        document.getElementById('ct-wrapper')?.remove();
        panelWrapper = null;
    }

    function toggleTheme() {
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

        updateThemeButton();
        ensureIcons(100);
    }

    function injectButton() {
        const oldBtn = document.getElementById('btn-theme-toggle');
        if (oldBtn) oldBtn.remove();

        if (document.getElementById('btn-advanced-theme')) return;

        const container = document.querySelector('#sidebar-panel > div:nth-child(3)');
        if (!container) { setTimeout(injectButton, 500); return; }

        const btn = document.createElement('button');
        btn.id = 'btn-advanced-theme';
        btn.className = 'btn';
        btn.title = 'Theme Manager';
        btn.style.cssText = `
            color: #fbbf24 !important;
            border-color: #fbbf24 !important;
            background: rgba(251, 191, 36, 0.1) !important;
            transition: all 0.2s ease;
        `;
        btn.innerHTML = '<i data-lucide="palette" style="width:12px;height:12px;color:#fbbf24;"></i>';
        btn.onmouseover = () => {
            btn.style.background = 'rgba(251, 191, 36, 0.25) !important';
            btn.style.boxShadow = '0 0 16px rgba(251, 191, 36, 0.3)';
            btn.style.transform = 'scale(1.05)';
        };
        btn.onmouseout = () => {
            btn.style.background = 'rgba(251, 191, 36, 0.1) !important';
            btn.style.boxShadow = 'none';
            btn.style.transform = 'scale(1)';
        };
        btn.onclick = showPanel;
        container.appendChild(btn);
        ensureIcons(50);
    }

    async function init() {
        await loadThemeList();
        injectButton();
    }

    window.ChartThemes = {
        init,
        showPanel,
        close: closePanel,
        toggleTheme,
        addCurrent: addCurrentAsTheme,
        rename: renameTheme,
        remove: deleteTheme,
        apply: applyThemeById,
        save: saveThemeList,
        getList: () => themeList,
        updateButton: updateThemeButton,
        renderPanel: renderPanel
    };

    window.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
})();

(function ThemeCreator() {
    'use strict';

    let isExpanded = false;
    let injectAttempts = 0;
    const MAX_ATTEMPTS = 30;

    function getPanelContent() {
        const wrapper = document.getElementById('ct-wrapper');
        if (!wrapper) return null;
        return wrapper.querySelector('div[style*="background:var(--bg-panel)"]');
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

    function syncHexWithColor(colorId) {
        const colorInput = document.getElementById(colorId);
        const hexInput = document.getElementById(colorId + '-hex');
        if (colorInput && hexInput) {
            hexInput.value = colorInput.value.toUpperCase();
        }
    }

    function syncColorWithHex(colorId) {
        const colorInput = document.getElementById(colorId);
        const hexInput = document.getElementById(colorId + '-hex');
        if (colorInput && hexInput) {
            let hex = hexInput.value.trim();
            if (/^#[0-9a-f]{6}$/i.test(hex)) {
                colorInput.value = hex;
            } else if (/^[0-9a-f]{6}$/i.test(hex)) {
                colorInput.value = '#' + hex;
                hexInput.value = '#' + hex.toUpperCase();
            }
        }
    }

    function icon(name, size = 14) {
        return `<i data-lucide="${name}" style="width:${size}px;height:${size}px;"></i>`;
    }

    function createColorRow(label, id, defaultColor) {
        return `
            <div style="display:flex; align-items:center; gap:4px; padding:1px 0;">
                <span style="font-size:8px; color:var(--text-muted); width:28px; text-transform:uppercase; letter-spacing:0.2px; flex-shrink:0;">${label}</span>
                <input type="color" id="${id}" value="${defaultColor}"
                       style="width:22px; height:18px; border:1px solid var(--border-color); border-radius:2px; background:transparent; cursor:pointer; padding:0; flex-shrink:0;">
                <input type="text" id="${id}-hex" value="${defaultColor.toUpperCase()}"
                       style="flex:1; min-width:45px; max-width:65px; background:var(--bg-input); border:1px solid var(--border-color); color:var(--text-main); border-radius:2px; padding:1px 3px; font-size:8px; font-family:monospace; letter-spacing:0.3px;">
            </div>
        `;
    }

    function getColors() {
        