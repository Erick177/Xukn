currentSpeed);
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
        if (window.Engine && 