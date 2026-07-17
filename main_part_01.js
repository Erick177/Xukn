
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
                if (data && data.t