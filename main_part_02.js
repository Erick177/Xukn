abs && data.tabs.length > 0) {
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
        tabs = tabs.filter(t =>