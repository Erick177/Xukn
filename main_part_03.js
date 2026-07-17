 t.id !== tabId);
        if (activeTabId === tabId) activeTabId = tabs[0]?.id || null;
        saveRules(); render(); showToast('Strategy deleted', 'info');
    }

    function addRule(text, points) {
        const tab = getActiveTab();
        if (!tab) return;
        if (tab.rules.length >= 30) return showToast('Maximum 30 rules per strategy', 'warning');
        tab.rules.push({ id: generateRuleId(), text: text.trim(), points: Math.min(Math.max(points, 1), 25), checked: false });
        saveRules(); render(); showToast('Rule added!', 'success');
    }

    async function deleteRule(ruleId) {
        const ok = await confirmDialog({ title: 'Delete this rule?', confirmText: 'Delete' });
        if (!ok) return;
        const tab = getActiveTab();
        if (!tab) return;
        tab.rules = tab.rules.filter(r => r.id !== ruleId);
        saveRules(); render(); showToast('Rule deleted', 'info');
    }

    function editRule(ruleId, newText, newPoints) {
        const tab = getActiveTab();
        if (!tab) return;
        const rule = tab.rules.find(r => r.id === ruleId);
        if (!rule) return;
        rule.text = newText.trim(); rule.points = Math.min(Math.max(newPoints, 1), 25);
        saveRules(); render(); showToast('Rule updated', 'success');
    }

    function toggleRule(ruleId) {
        const tab = getActiveTab();
        if (!tab) return;
        const rule = tab.rules.find(r => r.id === ruleId);
        if (!rule) return;
        rule.checked = !rule.checked; saveRules(); render();
    }

    function toggleAll(checked) {
        const tab = getActiveTab();
        if (!tab) return;
        tab.rules.forEach(r => r.checked = checked);
        saveRules(); render(); showToast(checked ? 'All checked' : 'All unchecked', 'info');
    }

    function ruleFormHtml({ text = '', points = 10 } = {}) {
        return `<div style="text-align:left;"><label style="font-size:10px; color:var(--text-muted); display:block; margin:6px 0 3px;">Rule</label><input id="tr-rule-text" class="swal2-input" style="margin:0; width:100%; box-sizing:border-box;" placeholder="e.g., Check RSI" value="${text}"><label style="font-size:10px; color:var(--text-muted); display:block; margin:10px 0 3px;">Points (1-25)</label><input id="tr-rule-points" type="number" class="swal2-input" style="margin:0; width:100%; box-sizing:border-box;" value="${points}" min="1" max="25"></div>`;
    }

    function showAddRuleModal() {
        Swal.fire({
            title: `${icon('list-plus', 16)} Add Rule`, html: ruleFormHtml(), ...swalTheme, confirmButtonText: 'Add', showCancelButton: true, cancelButtonText: 'Cancel', focusConfirm: false,
            didOpen: () => { refreshIcons(); document.getElementById('tr-rule-text')?.focus(); },
            preConfirm: () => {
                const text = document.getElementById('tr-rule-text').value.trim(), points = parseInt(document.getElementById('tr-rule-points').value) || 10;
                if (!text) { Swal.showValidationMessage('Please enter a rule'); return false; }
                return { text, points };
            }
        }).then(result => { if (result.isConfirmed) addRule(result.value.text, result.value.points); });
    }

    function showEditRuleModal(ruleId) {
        const tab = getActiveTab(); if (!tab) return;
        const rule = tab.rules.find(r => r.id === ruleId); if (!rule) return;
        Swal.fire({
            title: `${icon('pencil-line', 16)} Edit Rule`, html: ruleFormHtml(rule), ...swalTheme, confirmButtonText: 'Save', showCancelButton: true, cancelButtonText: 'Cancel', focusConfirm: false,
            didOpen: () => { refreshIcons(); const i = document.getElementById('tr-rule-text'); i?.focus(); i?.select(); },
            preConfirm: () => {
                const text = document.getElementById('tr-rule-text').value.trim(), points = parseInt(document.getElementById('tr-rule-points').value) || 10;
                if (!text) { Swal.showValidationMessage('Please enter a rule'); return false; }
                return { text, points };
            }
        }).then(result => { if (result.isConfirmed) editRule(ruleId, result.value.text, result.value.points); });
    }

    function togglePanel(forceClose = false) {
        const panel = getEl('tr-panel');
        if (!panel) return;

        if (forceClose) {
            isPanelOpen = false;
        } else {
            isPanelOpen = !isPanelOpen;
        }

        if (isPanelOpen) {
            panel.style.setProperty('display', 'flex', 'important');
            panel.classList.add('open');
            render();
            const orderPanel = document.getElementById('trade-panel-container');
            if (orderPanel) {
                orderPanel.style.display = 'none';
                orderPanel.classList.remove('open');
            }
        } else {
            panel.style.setProperty('display', 'none', 'important');
            panel.classList.remove('open');
        }
    }

    function buildUI() {
        if (document.getElementById('tr-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'tr-panel';
        panel.style.setProperty('display', 'none', 'important');

        panel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1px;">
                <span style="font-size:10px; font-weight:600; display:flex; align-items:center; gap:3px; color:var(--text-main);">
                    ${icon('clipboard-list', 12)} Rules
                </span>
                <div style="display:flex; align-items:center; gap:3px;">
                    <span id="tr-score" style="font-size:10px; font-weight:700; color:var(--accent-orange);">0%</span>
                    <button onclick="window.TRManager.exportRules()" style="background:var(--bg-btn); border:1px solid var(--border-color); color:var(--text-muted); border-radius:2px; padding:0 4px; cursor:pointer; height:16px; display:flex; align-items:center;" title="Save to JSON">${icon('save', 9)}</button>
                    <button onclick="window.TRManager.togglePanel()" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:0 2px; display:flex; align-items:center;">${icon('x', 12)}</button>
                </div>
            </div>
            <div id="tr-tabs" style="display:flex; flex-wrap:wrap; gap:2px; max-height:50px; overflow-y:auto; padding:1px 0;"></div>
            <div id="tr-list" style="display:flex; flex-direction:column; gap:3px; min-height:40px; flex:1;"></div>
            <div style="margin-top:1px;">
                <div style="background:var(--bg-btn); border-radius:2px; height:2px; overflow:hidden; width:100%;">
                    <div id="tr-progress" style="height:100%; width:0%; background:var(--accent-blue); transition:width 0.3s ease;"></div>
                </div>
                <div id="tr-stats" style="margin-top:1px; text-align:center; font-size:8px; color:var(--text-muted);"></div>
            </div>
        `;

        const sidebar = document.getElementById('sidebar-panel');
        if (sidebar) {
            const tradePanel = document.getElementById('trade-panel-container');
            if (tradePanel) sidebar.insertBefore(panel, tradePanel);
            else sidebar.appendChild(panel);
        } else {
            document.body.appendChild(panel);
        }
        refreshIcons();
    }

    async function exportRules() {
        const data = { tabs, activeTabId, updatedAt: new Date().toISOString() };
        try {
            const response = await fetch('/save_rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            if (response.ok) showToast('Saved to rules.json!', 'success');
            else { showToast('Saved locally', 'warning'); localStorage.setItem('rules_backup', JSON.stringify(data)); }
        } catch (e) { showToast('Saved locally', 'warning'); localStorage.setItem('rules_backup', JSON.stringify(data)); }
    }

    function bindShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const active = document.activeElement;
                if (active && active.tagName === 'INPUT') return;
                togglePanel(); e.preventDefault();
            }
            if (e.key === 'Escape' && isPanelOpen) { togglePanel(true); e.preventDefault(); }
        });
    }

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .tr-scroll::-webkit-scrollbar { width: 2px; }
            .tr-scroll::-webkit-scrollbar-track { background: var(--bg-input); border-radius: 2px; }
            .tr-scroll::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 2px; }
            .tr-swal-popup, .swal2-popup { font-family: inherit !important; border: 1px solid var(--border-color, #363c4e); }
            .swal2-input { background: var(--bg-input, #1e222d) !important; color: #fff !important; border: 1px solid var(--border-color, #363c4e) !important; }
            .swal2-validation-message { background: transparent !important; color: var(--accent-red, #ef5350) !important; }
        `;
        document.head.appendChild(style);
    }

    async function init() {
        if (isInitialized) return;
        isInitialized = true;
        injectStyles();
        if (!(await loadRules())) if (!loadFromBackup()) { tabs = []; activeTabId = null; await saveRules(); }
        buildUI();
        bindShortcuts();
    }
	function stepForward() {
		// ... کد فعلی بدون تغییر تا رسیدن به این بخش ...

		if (lastCandle) {
			if (isBulkStep && tvWidget && typeof tvWidget.activeChart === 'function') {
				try { tvWidget.activeChart().resetData(); } catch (e) {}
			}

			const now = Date.now();
			if (now - lastUIRenderTime >= UI_RENDER_INTERVAL_MS || isBulkStep) {
				lastUIRenderTime = now;
				renderPositionsUI(lastCandle.close);
				updatePendingOrdersUI();
			}
		}
		updateCounterUI();
		pushStateToManager();
	}

    window.TRManager = {
        init, togglePanel, render, switchTab, showAddTabModal, showEditTabModal, deleteTab,
        addRule, deleteRule, editRule, toggleRule, toggleAll, showAddRuleModal, showEditRuleModal,
        exportRules, getTabs: () => tabs, getActiveTab, getStats, isOpen: () => isPanelOpen
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(init, 200);
    else document.addEventListener('DOMContentLoaded', () => setTimeout(init, 200));

})();

function refreshIcons() {
    if (window.lucide && typeof lucide.createIcons === 'function') {
        try { lucide.createIcons(); } catch (e) {}
    }
}

function ensureIcons(delay = 50) {
    setTimeout(refreshIcons, delay);
}

const SA_DEFAULTS = {
    background: 'var(--bg-panel, #161a25)',
    color: 'var(--text-main, #d1d4dc)',
    confirmButtonColor: 'var(--accent-blue, #2962ff)',
    cancelButtonColor: 'var(--bg-btn, #2a2e39)',
    customClass: {
        popup: 'swal-dark-popup',
        confirmButton: 'swal-confirm',
        cancelButton: 'swal-cancel',
        input: 'swal-input'
    }
};

function sa(opts) {
    return Swal.fire({ ...SA_DEFAULTS, ...opts });
}

window.alert = function(msg) {
    sa({ icon: 'info', html: String(msg), confirmButtonText: 'OK' });
};

function patchSessionManager() {
    if (!window.SessionManager || window.SessionManager.__uiPatched) return;
    window.SessionManager.__uiPatched = true;

    const _origSM_delete = SessionManager.handleDeleteClick;
    SessionManager.handleDeleteClick = async function(id, event) {
        event.stopPropagation();
        const res = await sa({
            icon: 'warning',
            title: 'Delete session?',
            text: 'All trades and progress for this session will be removed.',
            showCancelButton: true,
            confirmButtonText: 'Delete',
            confirmButtonColor: '#ef5350',
            cancelButtonText: 'Cancel'
        });
        if (!res.isConfirmed) return;

        const origConfirm = window.confirm;
        window.confirm = () => true;
        await _origSM_delete.call(SessionManager, id, { stopPropagation: () => {} });
        window.confirm = origConfirm;
    };

    const originalShow = SessionManager.showDashboard;
    if (originalShow) {
        SessionManager.showDashboard = function() {
            originalShow.call(this);
            ensureIcons(100);
        };
    }
}

(function injectDynamicStyles() {
    const style = document.createElement('style');
    style.textContent = `
        body.light-theme {
            --bg-main: #f0f2f5;
            --bg-panel: #ffffff;
            --bg-input: #f4f5f7;
            --bg-btn: #e4e6eb;
            --border-color: #d2d6dc;
            --text-main: #1c1e21;
            --text-muted: #606770;
        }
        body.light-theme .modal-content,
        body.light-theme .modal-header,
        body.light-theme .sess-card,
        body.light-theme .position-card {
            background: #ffffff !important;
            color: #1c1e21 !important;
        }
        body.light-theme .c