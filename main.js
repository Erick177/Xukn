
let sessions = [];
let activeSessionId = null;
let isDirty = false;
let autoSaveTimer = null;

let lastUIRenderTime = 0;
const UI_RENDER_INTERVAL_MS = 500;
const SessionManager = (function() {
    let sessions = [];
    let activeSessionId = null;

    async function loadSessionsFromServer() {
        try {
            const response = await fetch('/sessions_backups.json');
            if (response.ok) {
                sessions = await response.json();
            } else {
                sessions = [];
            }
        } catch (err) {
            console.log("No existing session file found on server. Starting fresh.");
            sessions = [];
        }
        renderDashboard();
    }

    async function saveAllSessionsToServer() {
        try {
            await fetch('/save_sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sessions)
            });
        } catch (err) {
            console.error("Failed to back up sessions to server:", err);
        }
    }
	function markDirty() {
		isDirty = true;
	}

	async function flushIfDirty() {
		if (!isDirty) return;
		isDirty = false;
		await saveAllSessionsToServer();
	}

	function startAutoSave() {
		if (autoSaveTimer) return;
		autoSaveTimer = setInterval(flushIfDirty, 5 * 60 * 1000);
	}


    async function scanDataFolder() {
        const selectMenu = document.getElementById("sess-file-name");
        if (!selectMenu) return;
        try {
            const response = await fetch('/data/');
            if (!response.ok) throw new Error();

            const files = await response.json();

            selectMenu.innerHTML = '<option value="">-- Select Data File --</option>';
            let filesFound = false;

            files.forEach(fileName => {
                const opt = document.createElement('option');
                opt.value = fileName;
                opt.innerText = fileName;
                selectMenu.appendChild(opt);
                filesFound = true;
            });

            if (!filesFound) {
                selectMenu.innerHTML = '<option value="">No files found in /data folder</option>';
            }
        } catch (err) {
            selectMenu.innerHTML = '<option value="">Error scanning /data folder</option>';
        }
    }

    async function createSession(sessionName, initialBalance, startDate, endDate, fileName, priceDecimals) {
        document.getElementById("create-btn-text").innerText = "Validating...";
        try {
            const response = await fetch(`/data/${fileName}`, { method: 'HEAD' });
            if (!response.ok) throw new Error(`Could not find ${fileName} in /data/`);

            const newSession = {
                id: Date.now(),
                symbol: sessionName,
                fileName: fileName,
                initialBalance: parseFloat(initialBalance),
                currentBalance: parseFloat(initialBalance),
                priceDecimals: parseInt(priceDecimals, 10) || 5,
                startDate,
                endDate,
                currentTimestamp: new Date(startDate).getTime(),
                replayIndex: 0,
                tradeJournal: [],
                createdAt: Date.now()
            };

            sessions.push(newSession);
            await saveAllSessionsToServer();
            renderDashboard();
        } catch (err) {
            alert("Error creating session: " + err.message);
        } finally {
            document.getElementById("create-btn-text").innerText = "Create Session";
        }
    }

    async function deleteSession(id) {
        sessions = sessions.filter(s => s.id !== id);
        if (activeSessionId === id) activeSessionId = null;
        await saveAllSessionsToServer();
        renderDashboard();
    }

    function calculateMetrics(session) {
        const journal = session.tradeJournal || [];
        const totalTrades = journal.length;
        const wins = journal.filter(t => parseFloat(t.PnL) > 0).length;
        const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : "0.0";
        const growth = (((session.currentBalance - session.initialBalance) / session.initialBalance) * 100).toFixed(2);
        return { winRate, growth, totalTrades };
    }

    function renderDashboard() {
        const container = document.getElementById("dashboard-sessions-list");
        if (!container) return;
        if (sessions.length === 0) {
            container.innerHTML = `<div style="color:var(--text-muted); text-align:center; grid-column: 1 / -1; padding:40px;">No backtest sessions available.</div>`;
            return;
        }
        container.innerHTML = sessions.map(session => {
            const { winRate, growth, totalTrades } = calculateMetrics(session);
            const isActive = session.id === activeSessionId;
            return `
                <div class="sess-card" style="border: 1px solid ${isActive ? 'var(--accent-blue)' : 'var(--border-color)'};">
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <span style="font-weight: 700; font-size: 14px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${session.symbol}</span>
                        <span style="font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${session.fileName}">${session.fileName}</span>
                        <span style="font-size: 9px; color: var(--text-muted); font-family: monospace;">Decimals: ${session.priceDecimals || 5}</span>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 6px; background: rgba(0,0,0,0.15); padding: 8px; border-radius: 6px; font-size: 11px;">
                        <div style="display:flex; justify-content:space-between;"><span style="color: var(--text-muted);">Balance:</span> <strong>$${session.currentBalance.toFixed(2)}</strong></div>
                        <div style="display:flex; justify-content:space-between;"><span style="color: var(--text-muted);">WinRate:</span> <strong>${winRate}%</strong></div>
                        <div style="display:flex; justify-content:space-between;"><span style="color: var(--text-muted);">Growth:</span> <strong style="color: ${parseFloat(growth) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}">${growth}%</strong></div>
                    </div>

                    <div style="display: flex; gap: 6px; margin-top: 4px;">
                        <button class="btn btn-sess-load" style="flex: 1; height: 26px; font-size: 11px; font-weight: 600; color: #fff; border: none; border-radius: 6px; cursor: pointer;" onclick="SessionManager.launchSession(${session.id})">${isActive ? 'Resume' : 'Load'}</button>
                        <button class="btn" style="height: 26px; font-size: 11px; color: var(--accent-red); background: transparent; border: 1px solid rgba(239,83,80,0.2);" onclick="SessionManager.handleDeleteClick(${session.id}, event)">Delete</button>
                    </div>
                </div>
            `;
        }).join("");
    }

    async function launchSession(id) {
        const session = sessions.find(s => s.id === id);
        if (!session) return;
        activeSessionId = id;
        renderDashboard();
        document.getElementById("dashboard-overlay").classList.remove("active");
        if (window.Engine && typeof window.Engine.loadSessionIntoEngine === "function") {
            await window.Engine.loadSessionIntoEngine(session);
        }
    }

    function syncActiveSessionState(engineState) {
        if (!activeSessionId) return;
        const session = sessions.find(s => s.id === activeSessionId);
        if (!session) return;
        session.currentBalance = engineState.currentBalance;
		session.timeframe = engineState.timeframe;

        session.currentTimestamp = engineState.currentTimestamp;
        session.replayIndex = engineState.replayIndex;
        session.tradeJournal = engineState.tradeJournal;
    }

    function exportSessionCSV(id) {
        const session = sessions.find(s => s.id === id);
        if (!session || !session.tradeJournal.length) return alert("No trades recorded.");

        let rows = [["Id", "Type", "Lots", "EntryPrice", "ExitPrice", "Outcome", "PnL", "Current Balance", "Note", "Update Note", "Date"].join(",")];

        for (const t of session.tradeJournal) {
            const currentBal = t.BalanceAfter || t.BalanceBefore || "0.00";
            const originalNote = t.Note || "";
            const updatedNote = t.UpdateNote || "";

            rows.push([t.Id, t.Type, t.Lots, t.EntryPrice, t.ExitPrice, t.Outcome, t.PnL, currentBal, originalNote, updatedNote, t.Date || ""].join(","));
        }

        const csvContent = "\uFEFF" + rows.join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `Session_Journal_${session.symbol}.csv`;
        link.click();
    }

    function showDashboard() {
        scanDataFolder();
        renderDashboard();
        document.getElementById("dashboard-overlay").classList.add("active");
    }

    async function handleDeleteClick(id, event) {
        event.stopPropagation();
        if (confirm("Delete this session?")) await deleteSession(id);
    }

    window.addEventListener("DOMContentLoaded", async () => {
		await loadSessionsFromServer();
		startAutoSave();
		


        const syncForm = document.getElementById("create-session-form");
        if (syncForm) {
            syncForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const symbol = document.getElementById("sess-symbol").value.trim();
                const balance = document.getElementById("sess-balance").value;
                const decimals = document.getElementById("sess-decimals").value;
                const start = document.getElementById("sess-start").value;
                const end = document.getElementById("sess-end").value;
                const file = document.getElementById("sess-file-name").value;
                if (!symbol || !balance || !start || !end || !file) return alert("Please fill all fields.");
                await createSession(symbol, balance, start, end, file, decimals);
            });
        }
    });

    return {
		showDashboard, launchSession, syncActiveSessionState, exportSessionCSV,
		handleDeleteClick, getActiveSessionId: () => activeSessionId, saveAllSessionsToServer,
		markDirty,
		get sessions() { return sessions; }
	};

})();
window.SessionManager = SessionManager;

(function() {
    'use strict';

    let tabs = [];
    let activeTabId = null;
    let isPanelOpen = false;
    let isInitialized = false;
    const els = {};

    function getEl(id) {
        if (!els[id] || !document.body.contains(els[id])) {
            els[id] = document.getElementById(id);
        }
        return els[id];
    }

    function generateId() { return 't-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6); }
    function generateRuleId() { return 'r-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4); }
    function icon(name, size = 11) { return `<i data-lucide="${name}" style="width:${size}px;height:${size}px;"></i>`; }
    function refreshIcons() {
        if (window.refreshIcons) window.refreshIcons();
        else if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
    }

    const swalTheme = {
        background: 'var(--bg-panel, #161a25)', color: 'var(--text-main, #d1d4dc)',
        confirmButtonColor: 'var(--accent-blue, #2962ff)', cancelButtonColor: 'var(--bg-btn, #2a2e39)'
    };

    const Toast = window.Swal ? Swal.mixin({
        toast: true, position: 'bottom', showConfirmButton: false, timer: 1800, timerProgressBar: true,
        background: swalTheme.background, color: swalTheme.color,
        didOpen: (t) => { t.style.border = '1px solid var(--border-color, #363c4e)'; t.style.fontSize = '12px'; }
    }) : null;

    function showToast(message, type = 'info') {
        const iconMap = { success: 'success', warning: 'warning', error: 'error', info: 'info' };
        if (Toast) Toast.fire({ icon: iconMap[type] || 'info', title: message });
    }

    function confirmDialog({ title, text = '', confirmText = 'Confirm', danger = true }) {
        if (!window.Swal) return Promise.resolve(confirm(title));
        return Swal.fire({
            title, text, icon: 'warning', showCancelButton: true, confirmButtonText: confirmText, cancelButtonText: 'Cancel',
            ...swalTheme, confirmButtonColor: danger ? 'var(--accent-red, #ef5350)' : swalTheme.confirmButtonColor,
            customClass: { popup: 'tr-swal-popup' }
        }).then(r => r.isConfirmed);
    }

    async function loadRules() {
        try {
            const response = await fetch('/src/rules.json');
            if (response.ok) {
                const data = await response.json();
                if (data && data.tabs && data.tabs.length > 0) {
                    tabs = data.tabs; activeTabId = data.activeTabId || tabs[0]?.id || null; return true;
                }
            }
        } catch (e) {}
        return false;
    }

    async function saveRules() {
        try {
            const data = { tabs, activeTabId, updatedAt: new Date().toISOString() };
            const response = await fetch('/save_rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            if (!response.ok) localStorage.setItem('rules_backup', JSON.stringify(data));
        } catch (e) { localStorage.setItem('rules_backup', JSON.stringify({ tabs, activeTabId })); }
    }

    function loadFromBackup() {
        try {
            const backup = localStorage.getItem('rules_backup');
            if (backup) {
                const data = JSON.parse(backup);
                if (data.tabs && data.tabs.length > 0) {
                    tabs = data.tabs; activeTabId = data.activeTabId || tabs[0]?.id || null; return true;
                }
            }
        } catch (e) {}
        return false;
    }

    function getActiveTab() { return tabs.find(t => t.id === activeTabId) || tabs[0] || null; }

    function getStats(tab) {
        if (!tab) return { total: 0, checked: 0, totalPoints: 0, earnedPoints: 0, percent: 0, status: 'danger' };
        const total = tab.rules.length;
        const checked = tab.rules.filter(r => r.checked).length;
        const totalPoints = tab.rules.reduce((sum, r) => sum + r.points, 0);
        const earnedPoints = tab.rules.filter(r => r.checked).reduce((sum, r) => sum + r.points, 0);
        const percent = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
        let status = percent >= 80 ? 'good' : percent >= 50 ? 'warning' : 'danger';
        return { total, checked, totalPoints, earnedPoints, percent, status };
    }

    function render() {
        const container = getEl('tr-list');
        if (!container) return;
        const activeTab = getActiveTab();

        if (!activeTab || activeTab.rules.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:25px 10px; color:var(--text-muted);">
                    <div style="margin-bottom:6px; display:flex; justify-content:center;">${icon('clipboard-list', 26)}</div>
                    <div style="font-size:11px; margin-bottom:8px;">${!activeTab ? 'No strategy tabs' : 'No rules in this strategy'}</div>
                    <button onclick="${!activeTab ? 'window.TRManager.showAddTabModal()' : 'window.TRManager.showAddRuleModal()'}"
                            style="background:var(--accent-blue); border:none; color:#fff; padding:5px 14px; border-radius:4px; cursor:pointer; font-size:10px; display:inline-flex; align-items:center; gap:4px;">
                        ${icon('plus', 10)} ${!activeTab ? 'New Strategy' : 'Add Rule'}
                    </button>
                </div>`;
            updateStats(null); renderTabs(); refreshIcons(); return;
        }

        const stats = getStats(activeTab);
        updateStats(stats);

        let html = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; padding:0 2px;">
                <span style="font-size:8px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.3px;">${activeTab.rules.length} rules</span>
                <div style="display:flex; gap:2px;">
                    <button onclick="window.TRManager.toggleAll(true)" title="Check all" style="background:var(--bg-btn); border:1px solid var(--border-color); color:var(--accent-green); padding:1px 4px; border-radius:2px; cursor:pointer; display:flex; align-items:center;">${icon('check-check', 9)}</button>
                    <button onclick="window.TRManager.toggleAll(false)" title="Uncheck all" style="background:var(--bg-btn); border:1px solid var(--border-color); color:var(--accent-red); padding:1px 4px; border-radius:2px; cursor:pointer; display:flex; align-items:center;">${icon('square-x', 9)}</button>
                    <button onclick="window.TRManager.showAddRuleModal()" title="Add rule" style="background:var(--accent-blue); border:1px solid var(--accent-blue); color:#fff; padding:1px 5px; border-radius:2px; cursor:pointer; display:flex; align-items:center;">${icon('plus', 9)}</button>
                </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:2px; max-height:160px; overflow-y:auto; padding-right:2px;" class="tr-scroll">`;

        activeTab.rules.forEach(rule => {
            html += `
                <div style="display:flex; align-items:center; gap:4px; padding:3px 5px; background:var(--bg-input); border-radius:3px; border-left:2px solid ${rule.checked ? 'var(--accent-green)' : 'var(--border-color)'}; transition: all 0.15s ease;">
                    <input type="checkbox" ${rule.checked ? 'checked' : ''} onchange="window.TRManager.toggleRule('${rule.id}')" style="accent-color:var(--accent-blue); cursor:pointer; width:12px; height:12px; flex-shrink:0;">
                    <span style="flex:1; font-size:9.5px; color:${rule.checked ? 'var(--text-muted)' : 'var(--text-main)'}; text-decoration:${rule.checked ? 'line-through' : 'none'}; cursor:pointer; word-break:break-word;" onclick="window.TRManager.showEditRuleModal('${rule.id}')">${rule.text}</span>
                    <span style="font-size:7px; color:var(--text-muted); background:var(--bg-btn); padding:0 4px; border-radius:2px; white-space:nowrap; font-weight:600;">${rule.points}p</span>
                    <button onclick="window.TRManager.deleteRule('${rule.id}')" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:0 2px; opacity:0.35; transition:opacity 0.15s; display:flex;" onmouseover="this.style.opacity='1'; this.style.color='var(--accent-red)';" onmouseout="this.style.opacity='0.35'; this.style.color='var(--text-muted)';">${icon('trash-2', 10)}</button>
                </div>`;
        });

        html += '</div>';
        container.innerHTML = html;
        renderTabs();
        refreshIcons();
    }

    function renderTabs() {
        const container = getEl('tr-tabs');
        if (!container) return;
        if (tabs.length === 0) {
            container.innerHTML = `<button onclick="window.TRManager.showAddTabModal()" style="background:var(--accent-blue); border:none; color:#fff; padding:2px 8px; border-radius:3px; cursor:pointer; font-size:8px; white-space:nowrap; display:inline-flex; align-items:center; gap:3px;">${icon('plus', 8)} New Strategy</button>`;
            refreshIcons(); return;
        }

        let html = '<div style="display:flex; flex-wrap:wrap; gap:3px; max-height:60px; overflow-y:auto;">';
        tabs.forEach(tab => {
            const isActive = tab.id === activeTabId;
            const stats = getStats(tab);
            html += `
                <button onclick="window.TRManager.switchTab('${tab.id}')" style="background:${isActive ? tab.color : 'var(--bg-btn)'}; color:${isActive ? '#fff' : 'var(--text-main)'}; border:1px solid ${isActive ? tab.color : 'var(--border-color)'}; padding:1px 6px; border-radius:3px; cursor:pointer; font-size:8px; white-space:nowrap; transition: all 0.15s ease; display:flex; align-items:center; gap:2px; height:20px;">
                    <span style="display:inline-block; width:5px; height:5px; border-radius:50%; background:${tab.color};"></span>
                    ${tab.name}
                    <span style="font-size:6px; opacity:0.5;">${stats.checked}/${stats.total}</span>
                    <button onclick="event.stopPropagation(); window.TRManager.showEditTabModal('${tab.id}')" title="Edit" style="background:none; border:none; color:${isActive ? '#fff' : 'var(--text-muted)'}; cursor:pointer; padding:0 1px; opacity:0.5; display:flex;">${icon('pencil', 8)}</button>
                    <button onclick="event.stopPropagation(); window.TRManager.deleteTab('${tab.id}')" title="Delete" style="background:none; border:none; color:${isActive ? '#ff6b6b' : 'var(--text-muted)'}; cursor:pointer; padding:0 1px; opacity:0.4; display:flex;">${icon('x', 9)}</button>
                </button>`;
        });
        html += `<button onclick="window.TRManager.showAddTabModal()" title="New strategy" style="background:var(--bg-btn); border:1px dashed var(--border-color); color:var(--text-muted); padding:1px 6px; border-radius:3px; cursor:pointer; white-space:nowrap; height:20px; display:flex; align-items:center;">${icon('plus', 9)}</button></div>`;
        container.innerHTML = html;
        refreshIcons();
    }

    function updateStats(stats) {
        const pbar = getEl('tr-progress'), statsEl = getEl('tr-stats'), scoreEl = getEl('tr-score');
        if (!stats) {
            if (pbar) { pbar.style.width = '0%'; pbar.style.background = 'var(--border-color)'; }
            if (statsEl) statsEl.innerHTML = '';
            if (scoreEl) { scoreEl.textContent = '0%'; scoreEl.style.color = 'var(--text-muted)'; }
            return;
        }
        if (pbar) { pbar.style.width = stats.percent + '%'; pbar.style.background = stats.status === 'good' ? 'var(--accent-green)' : stats.status === 'warning' ? 'var(--accent-orange)' : 'var(--accent-red)'; }
        if (statsEl) statsEl.innerHTML = `<span style="font-weight:600; color:var(--text-main);font-size:9px;">${stats.checked}/${stats.total}</span> <span style="color:var(--text-muted);font-size:8px;"> rules · </span> <span style="font-weight:700;font-size:9px; color:${stats.status === 'good' ? 'var(--accent-green)' : stats.status === 'warning' ? 'var(--accent-orange)' : 'var(--accent-red)'}">${stats.earnedPoints}/${stats.totalPoints} pts</span>`;
        if (scoreEl) { scoreEl.textContent = stats.percent + '%'; scoreEl.style.color = stats.status === 'good' ? 'var(--accent-green)' : stats.status === 'warning' ? 'var(--accent-orange)' : 'var(--accent-red)'; }
    }

    function switchTab(tabId) {
        if (activeTabId === tabId) return;
        activeTabId = tabId; saveRules(); render();
    }

    function tabFormHtml({ name = '', color = '#3b82f6' } = {}) {
        return `<div style="text-align:left;"><label style="font-size:10px; color:var(--text-muted); display:block; margin:6px 0 3px;">Name</label><input id="tr-tab-name" class="swal2-input" style="margin:0; width:100%; box-sizing:border-box;" placeholder="e.g., Breakout" value="${name}"><label style="font-size:10px; color:var(--text-muted); display:block; margin:10px 0 3px;">Color</label><input id="tr-tab-color" type="color" value="${color}" style="width:100%; height:32px; border:1px solid var(--border-color); border-radius:4px; cursor:pointer; background:transparent;"></div>`;
    }

    function showAddTabModal() {
        Swal.fire({
            title: `${icon('folder-plus', 16)} New Strategy`, html: tabFormHtml(), ...swalTheme, confirmButtonText: 'Create', showCancelButton: true, cancelButtonText: 'Cancel', focusConfirm: false,
            didOpen: () => { refreshIcons(); document.getElementById('tr-tab-name')?.focus(); },
            preConfirm: () => {
                const name = document.getElementById('tr-tab-name').value.trim(), color = document.getElementById('tr-tab-color').value;
                if (!name) { Swal.showValidationMessage('Please enter a strategy name'); return false; }
                return { name, color };
            }
        }).then(result => {
            if (!result.isConfirmed) return;
            const newTab = { id: generateId(), name: result.value.name, color: result.value.color, rules: [] };
            tabs.push(newTab); activeTabId = newTab.id; saveRules(); render(); showToast('Strategy created!', 'success');
        });
    }

    function showEditTabModal(tabId) {
        const tab = tabs.find(t => t.id === tabId);
        if (!tab) return;
        Swal.fire({
            title: `${icon('pencil', 16)} Edit Strategy`, html: tabFormHtml(tab), ...swalTheme, confirmButtonText: 'Save', showCancelButton: true, cancelButtonText: 'Cancel', focusConfirm: false,
            didOpen: () => { refreshIcons(); const i = document.getElementById('tr-tab-name'); i?.focus(); i?.select(); },
            preConfirm: () => {
                const name = document.getElementById('tr-tab-name').value.trim(), color = document.getElementById('tr-tab-color').value;
                if (!name) { Swal.showValidationMessage('Please enter a strategy name'); return false; }
                return { name, color };
            }
        }).then(result => {
            if (!result.isConfirmed) return;
            tab.name = result.value.name; tab.color = result.value.color; saveRules(); render(); showToast('Strategy updated!', 'success');
        });
    }

    async function deleteTab(tabId) {
        if (tabs.length <= 1) return showToast('Cannot delete the last strategy', 'warning');
        const tab = tabs.find(t => t.id === tabId);
        const ok = await confirmDialog({ title: `Delete "${tab?.name}"?`, text: 'This cannot be undone.', confirmText: 'Delete' });
        if (!ok) return;
        tabs = tabs.filter(t => t.id !== tabId);
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
        body.light-theme .control-input {
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
        }).then(result => {
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
            }

            bars.sort((a, b) => a.time - b.time);

            if (bars.length === 0) {
                consecutiveEmptyFetches++;
                if (consecutiveEmptyFetches >= MAX_EMPTY_FETCHES) {
                    ended = true;
                    console.log("End of data reached.");
                }
                return;
            }

            consecutiveEmptyFetches = 0;

            const cleanBars = [];
            let lastValidTime = queryTime;
            const MAX_GAP_MS = 4 * 24 * 60 * 60 * 1000;
            const FALLBACK_STEP_MS = 60000;

            for (const bar of bars) {
                if (bar.time <= lastValidTime) continue;

                if (lastValidTime > 0 && bar.time > lastValidTime + MAX_GAP_MS) {
                    bar.time = lastValidTime + FALLBACK_STEP_MS;
                }

                cleanBars.push(bar);
                lastValidTime = bar.time;
            }

            if (cleanBars.length === 0) {
                consecutiveEmptyFetches++;
                if (consecutiveEmptyFetches >= MAX_EMPTY_FETCHES) ended = true;
            } else {
                buffer = buffer.concat(cleanBars);
                console.log(`Buffer refilled: ${cleanBars.length} bars added.`);
            }
        } catch (err) {
            console.error("Error refilling buffer:", err);
            consecutiveEmptyFetches++;
            setTimeout(() => { fetching = false; refillBuffer(); }, 2000);
            return;
        } finally {
            fetching = false;
        }
    }

    function rebuildTimeframe() {
        if (rawHistory.length === 0) {
            aggregated = [];
            currentLiveBar = null;
            replayCursor = 0;
            updateViewport();
            return [];
        }

        const tfMs = timeframe * 60000;
        const out = [];
        let currentBar = null;

        for (const b of rawHistory) {
            const bucketTime = Math.floor(b.time / tfMs) * tfMs;

            if (!currentBar || currentBar.time !== bucketTime) {
                if (currentBar) out.push(currentBar);
                currentBar = {
                    time: bucketTime,
                    open: b.open,
                    high: b.high,
                    low: b.low,
                    close: b.close,
                    volume: b.volume
                };
            } else {
                currentBar.high = Math.max(currentBar.high, b.high);
                currentBar.low = Math.min(currentBar.low, b.low);
                currentBar.close = b.close;
                currentBar.volume += b.volume;
            }
        }
        if (currentBar) out.push(currentBar);

        aggregated = out;
        currentLiveBar = aggregated[aggregated.length - 1] || null;
        replayCursor = aggregated.length;
        updateViewport();
        return aggregated;
    }

    function updateViewport() {
        const start = Math.max(0, replayCursor - maxVisible);
        viewport = aggregated.slice(start, replayCursor);
        return viewport;
    }

    function advanceDataEngine(steps) {
        const produced = [];
        const MINUTE_MS = 60000;

        if (buffer.length === 0) {
            if (!fetching && !ended) refillBuffer();
            if (buffer.length === 0) return produced;
        }

        for (let s = 0; s < steps; s++) {
            if (buffer.length === 0) {
                if (!fetching && !ended) refillBuffer();
                break;
            }

            let baseBar = buffer.shift();
            if (!baseBar) break;

            if (cursorTime === null) cursorTime = baseBar.time;

            const expectedTime = cursorTime + MINUTE_MS;
            const timeDiff = baseBar.time - expectedTime;

            if (timeDiff > 0) {
                const missingMinutes = Math.floor(timeDiff / MINUTE_MS);
                if (missingMinutes > 0 && missingMinutes <= 10) {
                    const padPrice = currentLiveBar ? currentLiveBar.close : baseBar.open;
                    const pads = [];
                    for (let i = 0; i < missingMinutes; i++) {
                        const padTime = expectedTime + (i * MINUTE_MS);
                        if (padTime < baseBar.time) {
                            pads.push({
                                time: padTime, open: padPrice, high: padPrice, low: padPrice, close: padPrice, volume: 0
                            });
                        }
                    }
                    if (pads.length > 0) {
                        buffer = pads.concat([baseBar], buffer);
                        baseBar = buffer.shift();
                    }
                } else if (missingMinutes > 10) {
                    cursorTime = baseBar.time - MINUTE_MS;
                }
            }

            if (currentLiveBar && baseBar.time <= currentLiveBar.time) {
                if (baseBar.volume !== 0 && baseBar.time > cursorTime) {
                    cursorTime = baseBar.time;
                }
                continue;
            }

            cursorTime = baseBar.time;

            if (!rawHistory.length || rawHistory[rawHistory.length - 1].time < baseBar.time) {
                rawHistory.push({ ...baseBar });
            }

            const candleTimeframeMs = timeframe * MINUTE_MS;
            const bucketTime = Math.floor(baseBar.time / candleTimeframeMs) * candleTimeframeMs;

            if (!currentLiveBar || currentLiveBar.time !== bucketTime) {
                currentLiveBar = {
                    time: bucketTime,
                    open: baseBar.open,
                    high: baseBar.high,
                    low: baseBar.low,
                    close: baseBar.close,
                    volume: baseBar.volume
                };
                aggregated.push(currentLiveBar);
            } else {
                currentLiveBar.high = Math.max(currentLiveBar.high, baseBar.high);
                currentLiveBar.low = Math.min(currentLiveBar.low, baseBar.low);
                currentLiveBar.close = baseBar.close;
                currentLiveBar.volume += baseBar.volume;
                aggregated[aggregated.length - 1] = currentLiveBar;
            }

            replayCursor = aggregated.length;

            // --- بخش جدید: جلوگیری از رشد بی‌نهایت حافظه ---
            if (aggregated.length > MAX_HISTORY + TRIM_BATCH) {
                const trimCount = aggregated.length - MAX_HISTORY;
                aggregated.splice(0, trimCount);
                replayCursor -= trimCount;
            }
            if (rawHistory.length > MAX_HISTORY + TRIM_BATCH) {
                rawHistory.splice(0, rawHistory.length - MAX_HISTORY);
            }
            // --- پایان بخش جدید ---

            produced.push(currentLiveBar);

            if (buffer.length < 200 && !fetching && !ended) refillBuffer();
        }

        updateViewport();   // فقط یه‌بار، بعد از تموم شدن کل حلقه
        return produced;
    }

    const offlineDatafeed = {
        onReady: (cb) => setTimeout(() => cb({ supported_resolutions: ["1", "5", "15", "60", "240", "1440"] }), 0),
        searchSymbols: (ui, ex, sTy, onRes) => onRes([]),
        resolveSymbol: (sName, onRes) => setTimeout(() => onRes({
            name: currentSymbol, ticker: currentSymbol,
            description: `${currentSymbol} Replay`, type: "forex",
            session: "24x7", timezone: "Etc/UTC", exchange: "LOCAL",
            minmov: 1, pricescale: getPricescaleForSymbol(), has_intraday: true,
            supported_resolutions: ["1", "5", "15", "60", "240", "1440"],
            data_status: "streaming"
        }), 0),
        getBars: (sInfo, res, pParams, onHist) => {
            if (pParams.firstDataRequest) {
                onHist([...viewport], { noData: false });
            } else {
                onHist([], { noData: true });
            }
        },
        subscribeBars: (sInfo, res, onReal, lId) => { realtimeCallback = onReal; currentListenerId = lId; },
        unsubscribeBars: (lId) => { if (currentListenerId === lId) realtimeCallback = null; }
    };

    function createChartWidget() {
        const container = getEl("tv_chart_container");
        if (!container) return;
        container.innerHTML = "";
        tvWidget = new TradingView.widget({
            container: "tv_chart_container", library_path: "src/charting_library/",
            datafeed: offlineDatafeed, symbol: currentSymbol, interval: timeframe.toString(),
            fullscreen: false, autosize: true, locale: 'en',
            disabled_features: ["header_symbol_search", "header_compare"],
            enabled_features: ["side_toolbar_in_popup"],
            overrides: { "mainSeriesProperties.style": 1 }
        });
        tvWidget.onChartReady(() => {
            tvWidget.activeChart().onIntervalChanged().subscribe(null, (interval) => {
                const targetTF = parseInt(interval) || 1;
                if (timeframe !== targetTF) {
                    timeframe = targetTF;
                    syncTimeframeData();
                }
            });
        });
        window._tvWidgetRef = tvWidget;
    }

    function syncTimeframeData() {
        togglePlay(false);
        rebuildTimeframe();
        updateCounterUI();

        const currentChart = tvWidget || window._tvWidgetRef;
        if (currentChart && typeof currentChart.activeChart === 'function') {
            try { currentChart.activeChart().resetData(); } catch (e) { createChartWidget(); }
        } else { createChartWidget(); }
    }
	async function fetchBarsRaw(fromTime) {
		try {
			const response = await fetch(`http://localhost:8000/api/bars?file=${dataFile}&from=${fromTime}&resolution=1&countBack=5000`);
			if (!response.ok) return [];
			const contentType = response.headers.get("content-type") || "";
			let bars = [];
			if (contentType.includes("application/json")) {
				const data = await response.json();
				bars = Array.isArray(data) ? data : (data.bars || []);
			} else {
				const textData = await response.text();
				bars = textData.split("\n").map(line => {
					const parts = line.split(",");
					if (parts.length < 5) return null;
					const timeMs = new Date(parts[0].trim()).getTime();
					if (isNaN(timeMs)) return null;
					return { time: timeMs, open: parseFloat(parts[1]), high: parseFloat(parts[2]), low: parseFloat(parts[3]), close: parseFloat(parts[4]), volume: parts[5] ? parseFloat(parts[5]) : 0 };
				}).filter(Boolean);
			}
			bars.sort((a, b) => a.time - b.time);
			return bars;
		} catch (e) {
			console.error("fetchBarsRaw error:", e);
			return [];
		}
	}

    async function loadSessionIntoEngine(session) {
        togglePlay(false);
        currentSymbol = session.symbol || session.name || "SIMULATION";
        currentPriceDecimals = session.priceDecimals || session.decimals || 5;
        initialBalance = session.initialBalance || 1000;
        currentBalance = session.currentBalance || session.initialBalance || 1000;
        tradeJournal = session.tradeJournal || session.trades || [];
        activePositions = session.positions || [];
        pendingOrders = session.pendingOrders || [];

        const counterEl = getEl("candle-counter");
        if (counterEl) counterEl.innerText = "Initializing...";

        let savedTimestamp = session.currentTimestamp || session.startDate;
        if (typeof savedTimestamp === "string" || isNaN(savedTimestamp)) {
            savedTimestamp = new Date(savedTimestamp).getTime();
        } else {
            savedTimestamp = Number(savedTimestamp);
        }

        resetEngine();
		dataFile = session.fileName || session.dataFile;
		timeframe = parseInt(session.timeframe) || 1;

		const DESIRED_HISTORY = 15000;
		const CHUNK_SIZE = 5000;

		let allBars = [];
		let fetchFrom = Math.max(0, savedTimestamp - (DESIRED_HISTORY * 60000));

		while (allBars.length < DESIRED_HISTORY) {
			const chunk = await fetchBarsRaw(fetchFrom);
			if (chunk.length === 0) break;

			const filtered = chunk.filter(b => allBars.length === 0 || b.time > allBars[allBars.length - 1].time);
			if (filtered.length === 0) break;

			allBars = allBars.concat(filtered);

			const lastTime = filtered[filtered.length - 1].time;
			if (lastTime >= savedTimestamp) break;
			if (chunk.length < CHUNK_SIZE) break;

			fetchFrom = lastTime + 60000;
		}

		if (allBars.length > 0) {
			let barsToConsume = 0;
			for (let i = 0; i < allBars.length; i++) {
				if (allBars[i].time > savedTimestamp) break;
				barsToConsume++;
			}
			buffer = allBars;
			advanceDataEngine(Math.max(barsToConsume, 1));
		} else {
			cursorTime = savedTimestamp;
		}


        updateBalanceUI();
        createChartWidget();
        updateCounterUI();
        renderPositionsUI(aggregated.length ? aggregated[aggregated.length - 1].close : 0);
        updatePendingOrdersUI();
        updateJournalUI();
        pushStateToManager();
    }

    function stepForward() {
        const stepCountInput = getEl("step-count");
        const steps = stepCountInput ? (parseInt(stepCountInput.value) || 1) : 1;
        let lastCandle = null;
        const isBulkStep = steps > 5;

        if (ended && buffer.length === 0) {
            console.log("Reached end of data");
            togglePlay(false);
            return;
        }

        const producedBars = advanceDataEngine(steps);

        const streamLive = !isBulkStep || isPlaying;

        if (producedBars.length > 0) {
            lastCandle = producedBars[producedBars.length - 1];
            if (streamLive && realtimeCallback) {
                producedBars.forEach(bar => realtimeCallback(bar));
            }
            producedBars.forEach(bar => checkExecutionMatrixQuiet(bar));
        } else {
            if (ended && buffer.length === 0) {
                console.log("No more data available");
                togglePlay(false);
                return;
            }
            if (fetching) return;
        }

        if (lastCandle) {
            if (!streamLive && tvWidget && typeof tvWidget.activeChart === 'function') {
                try { tvWidget.activeChart().resetData(); } catch (e) {}
            }
            renderPositionsUI(lastCandle.close);
            updatePendingOrdersUI();
        }
        updateCounterUI();
        pushStateToManager();
    }

    function createOrder(orderType) {
        if (!aggregated || aggregated.length === 0) return;
        const currentBar = aggregated[aggregated.length - 1];

        const orderModeEl = getEl("trade-order-type");
        const orderMode = orderModeEl ? orderModeEl.value : "MARKET";

        let entryPrice = orderMode === "LIMIT" ? parseFloat(getEl("trade-entry-price").value) : currentBar.close;
        let slPrice = parseFloat(getEl("trade-sl-price").value);
        let rrRatio = parseFloat(getEl("trade-rr-ratio").value) || 2;
        let dollarRisk = parseFloat(getEl("trade-risk-usd").value) || 10;

        if (isNaN(entryPrice) || isNaN(slPrice) || (orderType === "BUY" && slPrice >= entryPrice) || (orderType === "SELL" && slPrice <= entryPrice)) {
            return;
        }

        let priceDistance = Math.abs(entryPrice - slPrice);
        let tpPrice = orderType === "BUY" ? entryPrice + (priceDistance * rrRatio) : entryPrice - (priceDistance * rrRatio);
        let positionSize = dollarRisk / priceDistance;

        let orderData = {
            id: Date.now() + Math.random(),
            type: orderType,
            size: positionSize,
            entryPrice,
            sl: slPrice,
            tp: tpPrice,
            entryTime: new Date(currentBar.time).toISOString().substring(0, 19),
            note: getEl("trade-note") ? getEl("trade-note").value || "" : "",
            riskAmount: dollarRisk
        };

        if (orderMode === "LIMIT") {
            pendingOrders.push(orderData);
            updatePendingOrdersUI();
        } else {
            activePositions.push(orderData);
            renderPositionsUI(currentBar.close);
        }

        if (getEl("trade-note")) getEl("trade-note").value = "";
        pushStateToManager();
    }
	function cancelPendingOrder(orderId) {
        const idx = pendingOrders.findIndex(o => o.id === orderId);
        if (idx === -1) return;
        pendingOrders.splice(idx, 1);
        updatePendingOrdersUI();
        pushStateToManager();
    }

    function checkExecutionMatrixQuiet(candle) {
        let stateChanged = false;

        for (let i = pendingOrders.length - 1; i >= 0; i--) {
            let p = pendingOrders[i];
            if (candle.low <= p.entryPrice && candle.high >= p.entryPrice) {
                activePositions.push(p);
                pendingOrders.splice(i, 1);
                stateChanged = true;
            }
        }

        for (let i = activePositions.length - 1; i >= 0; i--) {
            let pos = activePositions[i];
            let triggered = false, outcome = "", executionPrice = 0;
            if (pos.type === 'BUY') {
                if (candle.low <= pos.sl) { triggered = true; outcome = "SL"; executionPrice = pos.sl; }
                else if (candle.high >= pos.tp) { triggered = true; outcome = "TP"; executionPrice = pos.tp; }
            } else {
                if (candle.high >= pos.sl) { triggered = true; outcome = "SL"; executionPrice = pos.sl; }
                else if (candle.low <= pos.tp) { triggered = true; outcome = "TP"; executionPrice = pos.tp; }
            }
            if (triggered) {
                executeClose(pos.id, outcome, executionPrice, pos.size, true, false);
                stateChanged = true;
            }
        }
        if (stateChanged) {
            updatePendingOrdersUI();
            updateJournalUI();
        }
        return stateChanged;
    }

    function openPositionDetail(posId) {
		const pos = activePositions.find(p => p.id === posId);
		if (!pos) return;
		const currentPrice = aggregated[aggregated.length - 1]?.close || 0;
		const pnl = (pos.type === 'BUY' ? (currentPrice - pos.entryPrice) : (pos.entryPrice - currentPrice)) * pos.size;

		if (getEl('pd-title')) getEl('pd-title').innerText = `${pos.type} — ${pos.size.toFixed(4)} units`;
		if (getEl('pd-entry')) getEl('pd-entry').innerText = pos.entryPrice.toFixed(getPriceDecimals());

		const pnlEl = getEl('pd-pnl');
		if (pnlEl) {
			pnlEl.innerText = `$${pnl.toFixed(2)}`;
			pnlEl.style.color = pnl >= 0 ? 'var(--accent-green, #10b981)' : 'var(--accent-red, #ef4444)';
		}

		if (getEl('pd-sl')) getEl('pd-sl').value = pos.sl;
		if (getEl('pd-tp')) getEl('pd-tp').value = pos.tp;

		if (getEl('pd-size')) {
			getEl('pd-size').value = pos.size.toFixed(4);
			getEl('pd-size').max = pos.size;
		}

		const detailPanel = getEl('pos-detail-panel');
		if (detailPanel) {
			detailPanel.dataset.posId = posId;
			detailPanel.classList.add('active');
		}

		
		console.log('Calling PositionExtras...');
		if (window.PositionExtras) {
			console.log('PositionExtras found, building UI...');
			if (typeof window.PositionExtras.buildPartialPercentUI === 'function') {
				window.PositionExtras.buildPartialPercentUI();
			}
			if (typeof window.PositionExtras.buildAddVolumeUI === 'function') {
				window.PositionExtras.buildAddVolumeUI();
			}
		} else {
			console.log('PositionExtras NOT found!');
		}
	}

    function closeDetailPanel() {
        if (getEl('pos-detail-panel')) getEl('pos-detail-panel').classList.remove('active');
    }

    function applyDetailChanges() {
        const detailPanel = getEl('pos-detail-panel');
        if (!detailPanel) return;
        const posId = +detailPanel.dataset.posId;
        const pos = activePositions.find(p => p.id === posId);
        if (!pos) return;

        const slVal = parseFloat(getEl('pd-sl').value);
        const tpVal = parseFloat(getEl('pd-tp').value);
        if (!isNaN(slVal)) pos.sl = slVal;
        if (!isNaN(tpVal)) pos.tp = tpVal;

        pushStateToManager();
        closeDetailPanel();
        renderPositionsUI(aggregated[aggregated.length - 1].close);
    }

    function renderPositionsUI(currentPrice) {
        const container = getEl("active-positions-list");
        if (!container) return;
        if (activePositions.length === 0) { container.innerHTML = ""; return; }
        const currentIds = new Set(activePositions.map(p => p.id));

        Array.from(container.children).forEach(card => {
            if (!currentIds.has(Number(card.dataset.posId))) card.remove();
        });

        activePositions.forEach(pos => {
            const pnl = (pos.type === 'BUY' ? (currentPrice - pos.entryPrice) : (pos.entryPrice - currentPrice)) * pos.size;
            const color = pnl >= 0 ? 'var(--accent-green, #10b981)' : 'var(--accent-red, #ef4444)';

            let card = container.querySelector(`.position-card[data-pos-id="${pos.id}"]`);
            if (!card) {
                card = document.createElement('div');
                card.dataset.posId = pos.id;
                card.style.cssText = 'cursor:pointer; display:flex; justify-content:space-between; align-items:center; padding:5px 8px; margin-bottom:4px; border-radius:4px;';
                card.onclick = () => openPositionDetail(pos.id);
                card.innerHTML = `
                    <span class="pos-type-label" style="font-weight:600; font-size:11px;"></span>
                    <span class="pos-pnl" style="font-weight:700; font-size:12px;"></span>
                    <span style="color:var(--text-muted, #8b91a8); font-size:14px; line-height:1;">⚙</span>`;
                container.appendChild(card);
            }
            card.className = `position-card ${pos.type === 'BUY' ? 'pos-buy' : 'pos-sell'}`;
            card.querySelector('.pos-type-label').innerHTML = `${pos.type} <span style="color:var(--text-muted, #8b91a8); font-size:10px;">${pos.size.toFixed(4)} units</span>`;
            const pnlEl = card.querySelector('.pos-pnl');
            pnlEl.textContent = `$${pnl.toFixed(2)}`;
            pnlEl.style.color = color;
        });
    }

    function executeClose(id, outcome, exitPrice, targetSize, removeActive = true, shouldRender = true) {
        const index = activePositions.findIndex(p => p.id === id);
        if (index === -1) return;
        const pos = activePositions[index];
        let pnl = (pos.type === 'BUY' ? (exitPrice - pos.entryPrice) : (pos.entryPrice - exitPrice)) * targetSize;

        currentBalance += pnl;
        updateBalanceUI();
        const currentBar = aggregated[aggregated.length - 1];
        tradeJournal.push({
            Id: tradeJournal.length + 1,
            Type: pos.type,
            Size: targetSize.toFixed(4),
            EntryPrice: pos.entryPrice.toFixed(getPriceDecimals()),
            ExitPrice: parseFloat(exitPrice).toFixed(getPriceDecimals()),
            Outcome: outcome,
            PnL: pnl.toFixed(2),
            BalanceAfter: currentBalance.toFixed(2),
            Note: pos.note ? pos.note.replace(/,/g, " ") : "",
            Date: currentBar ? new Date(currentBar.time).toISOString().substring(0, 10) : ""
        });

        if (removeActive) activePositions.splice(index, 1);
        if (shouldRender) renderPositionsUI(aggregated[aggregated.length - 1].close);

        pushStateToManager();
        updateJournalUI();
    }

    function closePosition(posId, closeSize) {
        const pos = activePositions.find(p => p.id === posId);
        if (!pos) return;

        const currentPrice = aggregated[aggregated.length - 1]?.close || 0;

        if (closeSize >= pos.size || closeSize === undefined) {
            executeClose(posId, 'MANUAL', currentPrice, pos.size, true, true);
            closeDetailPanel();
        } else {
            const pnl = (pos.type === 'BUY' ? (currentPrice - pos.entryPrice) : (pos.entryPrice - currentPrice)) * closeSize;
            currentBalance += pnl;
            updateBalanceUI();
            const currentBar = aggregated[aggregated.length - 1];
            tradeJournal.push({
                Id: tradeJournal.length + 1,
                Type: pos.type,
                Size: closeSize.toFixed(4),
                EntryPrice: pos.entryPrice.toFixed(getPriceDecimals()),
                ExitPrice: currentPrice.toFixed(getPriceDecimals()),
                Outcome: 'PARTIAL',
                PnL: pnl.toFixed(2),
                BalanceAfter: currentBalance.toFixed(2),
                Note: pos.note ? pos.note.replace(/,/g, ' ') : '',
                Date: currentBar ? new Date(currentBar.time).toISOString().substring(0, 10) : ''
            });
            pos.size -= closeSize;
            pushStateToManager();
            renderPositionsUI(currentPrice);
            updateJournalUI();

            if (pos.size <= 0) {
                const idx = activePositions.findIndex(p => p.id === posId);
                if (idx !== -1) activePositions.splice(idx, 1);
                closeDetailPanel();
            } else {
                openPositionDetail(posId);
            }
        }
    }

    function showHistoryModal() {
        const modal = getEl("history-modal");
        const list = getEl("history-list");
        if (!modal || !list) return;

        if (tradeJournal.length === 0) {
            list.innerHTML = "<div style='text-align:center; padding:20px; color:var(--text-muted);'>No trades recorded yet.</div>";
        } else {
            list.innerHTML = tradeJournal.map(t => `
                <div style="margin-bottom:5px; border-bottom:1px solid var(--border-color); padding-bottom:5px; cursor:pointer;">
                    <strong>#${t.Id}</strong> ${t.Type} |
                    <span style="color:${parseFloat(t.PnL) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}; font-weight:bold;">
                        $${t.PnL}
                    </span>
                    | Balance: $${t.BalanceAfter || '0'}
                    <div style="font-size:10px; color:var(--text-muted);">${t.Note || ''}</div>
                </div>
            `).join("");
        }
        modal.classList.add("active");
    }

    function updateSpeedFromSlider() {
        const slider = getEl("replay-speed-slider");
        if (!slider) return;
        const sliderValue = parseInt(slider.value);
        const minSpeed = 30;
        const maxSpeed = 1000;
        currentSpeed = maxSpeed - (sliderValue / 100) * (maxSpeed - minSpeed);
        if (isPlaying) {
            clearInterval(playInterval);
            playInterval = setInterval(stepForward, currentSpeed);
        }
    }

    function togglePlay(f) {
        isPlaying = f !== undefined ? f : !isPlaying;
        const btn = getEl("btn-play");

        if (isPlaying) {
            if (btn) {
                btn.innerHTML = '<i data-lucide="pause"></i>';
                refreshIcons();
            }
            clearInterval(playInterval);
            playInterval = setInterval(stepForward, currentSpeed);
        } else {
            if (btn) {
                btn.innerHTML = '<i data-lucide="play"></i>';
                refreshIcons();
            }
            clearInterval(playInterval);
        }
    }

    function updateBalanceUI() {
        if (getEl("current-balance")) getEl("current-balance").innerText = `$${currentBalance.toFixed(2)}`;
    }

    function updateCounterUI() {
        if (cursorTime && getEl("candle-counter")) {
            const date = new Date(cursorTime);
            const formattedDate = date.toLocaleDateString('en-US', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit'
            });
            getEl("candle-counter").innerText = formattedDate;
        }
    }

    function toggleTradePanel() {
        const p = getEl("trade-panel-container");
        if (p) p.style.display = (p.style.display === "block") ? "none" : "block";
    }

    function toggleLimitField() {
        const orderTypeEl = getEl("trade-order-type");
        const limitRow = getEl("limit-price-row");
        if (orderTypeEl && limitRow) {
            limitRow.style.display = (orderTypeEl.value === "LIMIT") ? "flex" : "none";
        }
    }

    function updatePendingOrdersUI() {
        const c = getEl("pending-orders-container");
        if (!c) return;
        if (pendingOrders.length === 0) { c.style.display = "none"; c.innerHTML = ""; return; }
        c.style.display = "block";

        const currentIds = new Set(pendingOrders.map(o => o.id));
        Array.from(c.children).forEach(row => {
            if (!currentIds.has(Number(row.dataset.orderId))) row.remove();
        });

        pendingOrders.forEach(o => {
            let row = c.querySelector(`[data-order-id="${o.id}"]`);
            if (!row) {
                row = document.createElement('div');
                row.dataset.orderId = o.id;
                row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:6px; padding:2px 4px; border-bottom: 1px solid #2a2f42;';
                row.innerHTML = `
                    <span class="pend-label" style="font-family:monospace; font-size:11px;"></span>
                    <span class="pend-cancel" style="cursor:pointer; color:var(--accent-red, #ef4444); font-weight:700;">✕</span>`;
                row.querySelector('.pend-cancel').onclick = () => cancelPendingOrder(o.id);
                c.appendChild(row);
            }
            row.querySelector('.pend-label').innerText = `${o.type} @ ${o.entryPrice.toFixed(getPriceDecimals())}`;
        });
    }

    function updateJournalUI() {
        const container = getEl("history-list");
        if (!container) return;

        if (tradeJournal.length === 0) {
            container.innerHTML = "<div style='text-align:center; padding:20px; color:var(--text-muted);'>No trades recorded yet.</div>";
            return;
        }

        container.innerHTML = tradeJournal.map(t => `
            <div style="margin-bottom:5px; border-bottom:1px solid var(--border-color); padding-bottom:5px; cursor:pointer;">
                <strong>#${t.Id}</strong> ${t.Type} |
                <span style="color:${parseFloat(t.PnL) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}; font-weight:bold;">
                    $${t.PnL}
                </span>
                | Balance: $${t.BalanceAfter || '0'}
                <div style="font-size:10px; color:var(--text-muted);">${t.Note || ''}</div>
            </div>
        `).join("");
    }

    function pushStateToManager() {
		if (window.SessionManager && window.SessionManager.getActiveSessionId()) {
			window.SessionManager.syncActiveSessionState({
				currentBalance,
				currentTimestamp: cursorTime,
				replayIndex: replayCursor,
				timeframe,
				tradeJournal,
				positions: activePositions,
				pendingOrders
			});
			window.SessionManager.markDirty();
		}
	}



    function forceResetOnStuck() {
        console.log("Force reset triggered");
        if (buffer.length === 0 && !ended) {
            fetching = false;
            consecutiveEmptyFetches = 0;
            refillBuffer();
        }
    }

    function initAppListeners() {
        if (getEl("btn-play")) getEl("btn-play").onclick = () => togglePlay();
        if (getEl("btn-step")) getEl("btn-step").onclick = () => stepForward();

        if (getEl("replay-speed-slider")) {
            getEl("replay-speed-slider").oninput = () => updateSpeedFromSlider();
        }

        if (getEl("trade-order-type")) {
            getEl("trade-order-type").onchange = () => toggleLimitField();
        }
        if (getEl("btn-buy")) getEl("btn-buy").onclick = () => createOrder("BUY");
        if (getEl("btn-sell")) getEl("btn-sell").onclick = () => createOrder("SELL");

        if (getEl("pd-apply")) getEl("pd-apply").onclick = () => applyDetailChanges();
        if (getEl("pd-cancel")) getEl("pd-cancel").onclick = () => closeDetailPanel();

        document.addEventListener("keydown", (e) => {
            if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
            const key = e.key.toLowerCase();
            if (key === " ") { e.preventDefault(); togglePlay(); }
            else if (key === "arrowright" || key === "f") { e.preventDefault(); stepForward(); }
            else if (key === "b") { e.preventDefault(); createOrder("BUY"); }
            else if (key === "s") { e.preventDefault(); createOrder("SELL"); }
        });
    }

    function toggleCollapse() {
        const bar = getEl("floating-control-bar");
        if (bar) bar.classList.toggle("collapsed");
    }

    function getSelectedRiskRewardShape() {
        const widget = tvWidget || window._tvWidgetRef;
        if (!widget || typeof widget.activeChart !== "function") return null;
        let chart;
        try { chart = widget.activeChart(); } catch (e) { return null; }
        if (!chart) return null;
        let sourceIds;
        try { sourceIds = chart.selection().allSources(); } catch (e) { return null; }
        if (!sourceIds || sourceIds.length !== 1) return null;
        let shape;
        try { shape = chart.getShapeById(sourceIds[0]); } catch (e) { return null; }
        if (!shape) return null;
        const toolname = shape._source && shape._source.toolname;
        if (toolname !== "LineToolRiskRewardLong" && toolname !== "LineToolRiskRewardShort") return null;
        return { shape, toolname };
    }

    function readRiskRewardDrawing() {
        const found = getSelectedRiskRewardShape();
        if (!found) return null;
        const { shape, toolname } = found;
        let props, points;
        try { props = shape.getProperties(); } catch (e) { return null; }
        try { points = shape.getPoints(); } catch (e) { return null; }
        if (!props || !points || !points.length) return null;

        const stopLevel = props.stopLevel;
        const profitLevel = props.profitLevel;
        if (typeof stopLevel !== "number" || typeof profitLevel !== "number") return null;

        const isLong = toolname === "LineToolRiskRewardLong";
        const direction = isLong ? 1 : -1;
        const scale = getPricescaleForSymbol();
        const scaledEntry = Math.round(points[0].price * scale);
        const toPrice = (v) => parseFloat((v / scale).toFixed(currentPriceDecimals));

        const entryPrice = toPrice(scaledEntry);
        const stopLoss = toPrice(scaledEntry - direction * stopLevel);
        const takeProfit = toPrice(scaledEntry + direction * profitLevel);
        const currentPrice = aggregated.length ? aggregated[aggregated.length - 1].close : entryPrice;

        let executionType;
        if (entryPrice === currentPrice) {
            executionType = "market";
        } else if (isLong) {
            executionType = entryPrice > currentPrice ? "stop" : "limit";
        } else {
            executionType = entryPrice < currentPrice ? "stop" : "limit";
        }

        return {
            tradeType: isLong ? "BUY" : "SELL",
            entryPrice,
            stopLoss,
            takeProfit,
            executionType,
            currentPrice
        };
    }

    function applyDrawingToOrderPanel() {
        const info = readRiskRewardDrawing();
        if (!info) {
            showToast("No RR Long/Short tool selected on chart", "warning");
            return false;
        }

        const orderTypeEl = getEl("trade-order-type");
        const entryEl = getEl("trade-entry-price");
        const slEl = getEl("trade-sl-price");
        const rrEl = getEl("trade-rr-ratio");
        if (!orderTypeEl || !entryEl || !slEl || !rrEl) return false;

        const isLimitOrder = info.executionType !== "market";
        orderTypeEl.value = isLimitOrder ? "LIMIT" : "MARKET";
        toggleLimitField();

        if (isLimitOrder) entryEl.value = info.entryPrice;
        slEl.value = info.stopLoss;

        const riskDistance = Math.abs(info.entryPrice - info.stopLoss);
        const rewardDistance = Math.abs(info.takeProfit - info.entryPrice);
        if (riskDistance > 0) {
            rrEl.value = parseFloat((rewardDistance / riskDistance).toFixed(2));
        }

        const panel = getEl("trade-panel-container");
        if (panel) {
            panel.style.display = "flex";
            panel.classList.add("open");
        }

        showToast(`${info.tradeType} setup loaded (${info.executionType.toUpperCase()})`, "success");
        return true;
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initAppListeners);
    } else {
        initAppListeners();
    }

    setInterval(() => {
        if (isPlaying && buffer.length === 0 && !fetching && !ended) {
            console.warn("Playback stuck - attempting recovery");
            forceResetOnStuck();
        }
    }, 1500);

    return {
        toggleTradePanel,
        toggleLimitField,
        applyDrawingToOrderPanel,
        createOrder,
        cancelPendingOrder,
        togglePlay,
        stepForward,
        updateSpeedFromSlider,
        loadSessionIntoEngine,
        loadSession: loadSessionIntoEngine,
        get currentTimestamp() { return cursorTime; },
        get currentSessionId() { return dataFile; },
        openPositionDetail,
        closeDetailPanel,
        applyDetailChanges,
        closePosition,
        closePositionFull: function(posId) {
            closePosition(posId, undefined);
        },
        showHistoryModal,
        updateJournalUI,
        toggleCollapse,
        forceResetOnStuck,
        closePartial: function() {
            const detailPanel = document.getElementById('pos-detail-panel');
            if (!detailPanel) return;
            const posId = detailPanel.dataset.posId;
            if (!posId) return;
            const lotsInput = document.getElementById('pd-partial-lots');
            const sizeToClose = lotsInput ? parseFloat(lotsInput.value) : undefined;
            if (isNaN(sizeToClose) || sizeToClose <= 0) return;
            closePosition(Number(posId), sizeToClose);
        },
        _internal: {
            getActivePositions: () => activePositions,
            getPendingOrders: () => pendingOrders,
            getTradeJournal: () => tradeJournal,
            getCurrentPrice: () => aggregated.length ? aggregated[aggregated.length - 1].close : null,
            getPriceDecimals: getPriceDecimals,
            renderPositionsUI: renderPositionsUI,
            pushStateToManager: pushStateToManager,
            executeClose: executeClose,
            getBufferStatus: () => ({
                bufferLength: buffer.length,
                fetching,
                ended,
                consecutiveEmptyFetches,
                cursorTime: new Date(cursorTime).toISOString()
            })
        }
    };
})();

window.Engine = Engine;
window.App = Engine;

(function() {
    'use strict';

    function notify(icon, text) {
        if (window.Swal) {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: icon,
                title: text,
                showConfirmButton: false,
                timer: 2000,
                background: 'var(--bg-panel, #161a25)',
                color: 'var(--text-main, #d1d4dc)'
            });
        }
    }

    function getActivePositions() {
        if (window.Engine && window.Engine._internal) {
            return window.Engine._internal.getActivePositions() || [];
        }
        return [];
    }

    function getCurrentPrice() {
        if (window.Engine && window.Engine._internal) {
            return window.Engine._internal.getCurrentPrice() || 0;
        }
        return 0;
    }

    function getPriceDecimals() {
        if (window.Engine && window.Engine._internal) {
            return window.Engine._internal.getPriceDecimals ? window.Engine._internal.getPriceDecimals() : 5;
        }
        return 5;
    }

    function getDetailPanelPosId() {
        const panel = document.getElementById('pos-detail-panel');
        if (!panel) return null;
        const posId = Number(panel.dataset.posId);
        return isNaN(posId) ? null : posId;
    }

    function closePositionByPercent(posId, percent) {
        if (isNaN(percent) || percent <= 0 || percent > 100) {
            return notify('error', 'Invalid percentage (1-100)');
        }

        const positions = getActivePositions();
        const pos = positions.find(p => String(p.id) === String(posId));

        if (!pos) {
            notify('error', 'Position not found');
            console.log('Position not found:', posId, 'Available positions:', positions);
            return;
        }

        const closeSize = parseFloat((pos.size * (percent / 100)).toFixed(4));
        if (closeSize <= 0) {
            notify('error', 'Close size too small');
            return;
        }

        console.log(`Closing ${percent}% of position ${posId}, size: ${closeSize}`);

        if (window.Engine && typeof window.Engine.closePosition === 'function') {
            window.Engine.closePosition(Number(posId), closeSize);
            return;
        }

        notify('error', 'Close function not available');
    }

    function buildPartialPercentUI() {
        const panel = document.getElementById('pos-detail-panel');
        if (!panel) return;

        const existing = document.getElementById('pe-partial-percent-row');
        if (existing) existing.remove();

        const sizeInput = document.getElementById('pd-partial-lots');
        if (!sizeInput) return;

        const row = document.createElement('div');
        row.id = 'pe-partial-percent-row';
        row.style.cssText = 'display:flex; flex-direction:column; gap:4px; margin-top:6px;';
        row.innerHTML = `
            <span class="pd-label">Close by %</span>
            <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;">
                <button class="btn pe-pct-btn" data-pct="10" style="flex:1; min-width:30px; height:22px; font-size:9px; padding:0 4px;">10%</button>
                <button class="btn pe-pct-btn" data-pct="25" style="flex:1; min-width:30px; height:22px; font-size:9px; padding:0 4px;">25%</button>
                <button class="btn pe-pct-btn" data-pct="50" style="flex:1; min-width:30px; height:22px; font-size:9px; padding:0 4px;">50%</button>
                <button class="btn pe-pct-btn" data-pct="75" style="flex:1; min-width:30px; height:22px; font-size:9px; padding:0 4px;">75%</button>
                <button class="btn pe-pct-btn" data-pct="100" style="flex:1; min-width:30px; height:22px; font-size:9px; padding:0 4px;">100%</button>
            </div>
        `;

        panel.appendChild(row);

        document.querySelectorAll('.pe-pct-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const pct = parseFloat(this.dataset.pct);
                const posId = getDetailPanelPosId();
                if (posId !== null) {
                    const positions = getActivePositions();
                    const pos = positions.find(p => String(p.id) === String(posId));
                    if (pos && sizeInput) {
                        sizeInput.value = (pos.size * (pct / 100)).toFixed(4);
                    }
                    closePositionByPercent(posId, pct);
                } else {
                    notify('error', 'No position selected');
                }
            });
        });
    }

    function buildAddVolumeUI() {
		const panel = document.getElementById('pos-detail-panel');
		if (!panel) return;

		const existing = document.getElementById('pe-add-volume-section');
		if (existing) existing.remove();

		const section = document.createElement('div');
		section.id = 'pe-add-volume-section';
		section.style.cssText = 'margin-top:6px;';
		section.innerHTML = `
			<div class="pd-divider" style="margin: 4px 0 8px 0;"></div>
			<span class="pd-label" style="display:block; margin-bottom:5px;">Add Volume (Scale-In)</span>
			<div style="display:flex; gap:6px; align-items:center;">
				<div style="display:flex; flex-direction:column; gap:2px;">
					<span class="pd-label">Size to add</span>
					<input type="number" step="0.01" min="0.01" id="pd-add-lots" class="control-input" style="height:26px; font-size:11px; width:100%;">
				</div>
				<button class="btn btn-green" id="pe-add-manual-btn" style="height:26px; font-size:11px; padding:0 12px; align-self:flex-end;">Add</button>
			</div>
			<div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap; margin-top:6px;">
				<button class="btn pe-add-quick" data-pct="10" style="flex:1; min-width:30px; height:22px; font-size:9px; padding:0 4px;">+10%</button>
				<button class="btn pe-add-quick" data-pct="25" style="flex:1; min-width:30px; height:22px; font-size:9px; padding:0 4px;">+25%</button>
				<button class="btn pe-add-quick" data-pct="50" style="flex:1; min-width:30px; height:22px; font-size:9px; padding:0 4px;">+50%</button>
				<button class="btn pe-add-quick" data-pct="100" style="flex:1; min-width:30px; height:22px; font-size:9px; padding:0 4px;">+100%</button>
			</div>
		`;

		panel.appendChild(section);

		function applyAddVolume(addSize) {
			const posId = getDetailPanelPosId();
			if (posId === null) return notify('error', 'No position selected');
			if (isNaN(addSize) || addSize <= 0) return notify('error', 'Invalid size');

			const positions = getActivePositions();
			const pos = positions.find(p => String(p.id) === String(posId));
			if (!pos) return notify('error', 'Position not found');

			const currentPrice = getCurrentPrice();
			if (!currentPrice) return;

			const newSize = pos.size + addSize;
			pos.entryPrice = (pos.entryPrice * pos.size + currentPrice * addSize) / newSize;
			pos.size = newSize;

			notify('success', `Added ${addSize.toFixed(4)} volume`);
			if (window.Engine && typeof window.Engine._internal?.renderPositionsUI === 'function') {
				window.Engine._internal.renderPositionsUI(currentPrice);
			}
			if (window.Engine && typeof window.Engine._internal?.pushStateToManager === 'function') {
				window.Engine._internal.pushStateToManager();
			}
		}

		const manualBtn = document.getElementById('pe-add-manual-btn');
		if (manualBtn) {
			manualBtn.addEventListener('click', function() {
				const addInput = document.getElementById('pd-add-lots');
				applyAddVolume(addInput ? parseFloat(addInput.value) : NaN);
			});
		}

		document.querySelectorAll('.pe-add-quick').forEach(btn => {
			btn.addEventListener('click', function() {
				const posId = getDetailPanelPosId();
				if (posId === null) return;
				const positions = getActivePositions();
				const pos = positions.find(p => String(p.id) === String(posId));
				if (!pos) return;
				const pct = parseFloat(this.dataset.pct);
				applyAddVolume(pos.size * (pct / 100));
			});
		});
	}


    function openPositionDetail(posId) {
		const pos = activePositions.find(p => p.id === posId);
		if (!pos) return;
		const currentPrice = aggregated[aggregated.length - 1]?.close || 0;
		const pnl = (pos.type === 'BUY' ? (currentPrice - pos.entryPrice) : (pos.entryPrice - currentPrice)) * pos.size;

		if (getEl('pd-title')) getEl('pd-title').innerText = `${pos.type} — ${pos.size.toFixed(4)} units`;
		if (getEl('pd-entry')) getEl('pd-entry').innerText = pos.entryPrice.toFixed(getPriceDecimals());

		const pnlEl = getEl('pd-pnl');
		if (pnlEl) {
			pnlEl.innerText = `$${pnl.toFixed(2)}`;
			pnlEl.style.color = pnl >= 0 ? 'var(--accent-green, #10b981)' : 'var(--accent-red, #ef4444)';
		}

		if (getEl('pd-sl')) getEl('pd-sl').value = pos.sl;
		if (getEl('pd-tp')) getEl('pd-tp').value = pos.tp;

		if (getEl('pd-size')) {
			getEl('pd-size').value = pos.size.toFixed(4);
			getEl('pd-size').max = pos.size;
		}

		const detailPanel = getEl('pos-detail-panel');
		if (detailPanel) {
			detailPanel.dataset.posId = posId;
			detailPanel.classList.add('active');
		}

		
		if (window.PositionExtras) {
			window.PositionExtras.buildPartialPercentUI();
			window.PositionExtras.buildAddVolumeUI();
		}
	}

    function init() {
        if (!window.Engine) {
            setTimeout(init, 200);
            return;
        }
      
        console.log('[positionExtras] Initialized successfully');
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 300);
    } else {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
    }

    window.PositionExtras = {
		closePositionByPercent: closePositionByPercent,
		buildPartialPercentUI: buildPartialPercentUI,
		buildAddVolumeUI: buildAddVolumeUI,
		addVolume: function() {
			const panel = document.getElementById('pos-detail-panel');
			if (!panel) return;
			
			const posId = Number(panel.dataset.posId);
			if (!posId || isNaN(posId)) {
				return notify('error', 'No position selected');
			}
			
			const addInput = document.getElementById('pd-add-lots');
			if (!addInput) return;
			
			const addSize = parseFloat(addInput.value);
			if (isNaN(addSize) || addSize <= 0) {
				return notify('error', 'Invalid size');
			}

			const positions = getActivePositions();
			const pos = positions.find(p => String(p.id) === String(posId));
			if (!pos) return notify('error', 'Position not found');

			const currentPrice = getCurrentPrice();
			if (!currentPrice) return;

			const newSize = pos.size + addSize;
			pos.entryPrice = (pos.entryPrice * pos.size + currentPrice * addSize) / newSize;
			pos.size = newSize;

			notify('success', `Added ${addSize.toFixed(4)} volume`);
			
			if (window.Engine && typeof window.Engine._internal?.renderPositionsUI === 'function') {
				window.Engine._internal.renderPositionsUI(currentPrice);
			}
			if (window.Engine && typeof window.Engine._internal?.pushStateToManager === 'function') {
				window.Engine._internal.pushStateToManager();
			}
		}
	};


})();
// Single unified exit-save handler.
// Replaces the 3 separate beforeunload listeners that used to exist
// (SessionManager's simple sendBeacon, fixTimeJumps' sessionId/timestamp-only
// beacon, and this full-state one). This is the most complete version, kept
// and hardened with a re-entry guard + a pagehide fallback for browsers
// (mobile Safari especially) that don't reliably fire beforeunload.

let __exitSaveDone = false;
function __saveSessionsOnExit() {
    if (__exitSaveDone) return;
    __exitSaveDone = true;

    try {
        if (window.SessionManager && window.Engine) {
            const activeId = window.SessionManager.getActiveSessionId();
            if (activeId && window.SessionManager.sessions) {
                const session = window.SessionManager.sessions.find(s => s.id === activeId);
                if (session && window.Engine._internal) {
                    session.currentBalance = window.Engine._internal.getCurrentBalance ? window.Engine._internal.getCurrentBalance() : session.currentBalance;
                    session.currentTimestamp = window.Engine.currentTimestamp || session.currentTimestamp;
                    session.replayIndex = window.Engine._internal.getReplayIndex ? window.Engine._internal.getReplayIndex() : session.replayIndex;
                    session.timeframe = window.Engine._internal.getTimeframe ? window.Engine._internal.getTimeframe() : session.timeframe;
                    session.tradeJournal = window.Engine._internal.getTradeJournal ? window.Engine._internal.getTradeJournal() : session.tradeJournal;
                    session.positions = window.Engine._internal.getActivePositions ? window.Engine._internal.getActivePositions() : [];
                    session.pendingOrders = window.Engine._internal.getPendingOrders ? window.Engine._internal.getPendingOrders() : [];
                }
            }
        }
    } catch(e) {}

    navigator.sendBeacon('/save_sessions', JSON.stringify(window.SessionManager ? window.SessionManager.sessions : []));

    try {
        localStorage.setItem('emergency_session_backup', JSON.stringify({
            sessions: window.SessionManager ? window.SessionManager.sessions : [],
            timestamp: Date.now()
        }));
    } catch(e) {}
}

window.addEventListener("beforeunload", __saveSessionsOnExit);
window.addEventListener("pagehide", __saveSessionsOnExit);
// Tab switched to background / minimized — also a good moment to persist,
// and on mobile this often fires when beforeunload/pagehide won't.
document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "hidden") {
        __saveSessionsOnExit();
    } else {
        // Tab is visible again — this wasn't a real close, so re-arm the
        // guard for the next actual exit.
        __exitSaveDone = false;
    }
});
// ===== ابزار تشخیص اشکال خطی و جایگذاری در پنل معاملات =====

// ===== ابزار تشخیص اشکال خطی و جایگذاری در پنل معاملات =====

// ===== ابزار تشخیص اشکال خطی و جایگذاری در پنل معاملات =====

