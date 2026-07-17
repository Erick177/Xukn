window.Engine._internal) {
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

