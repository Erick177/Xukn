;
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
            playInterval = setInterval(stepForward, 