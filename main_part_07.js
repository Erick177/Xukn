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
            console.log("Reached end of data")