/**
 * Focuser UI — Real data only, no mocks.
 */

async function invoke(cmd, args) {
  args = args || {};
  if (window.__TAURI__) return window.__TAURI__.core.invoke(cmd, args);
  throw new Error('Not running in Tauri');
}

var state = { blockLists: [], currentPage: 'dashboard' };

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Disable right-click context menu ───────────────────────────────
document.addEventListener('contextmenu', function(e) { e.preventDefault(); });

// ─── UI ─────────────────────────────────────────────────────────────

var ui = {
  navigateTo: function(page) {
    state.currentPage = page;
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
    var pageEl = document.getElementById('page-' + page);
    var navEl = document.querySelector('[data-page="' + page + '"]');
    if (pageEl) pageEl.classList.add('active');
    if (navEl) navEl.classList.add('active');
    switch (page) {
      case 'dashboard': this.refreshDashboard(); break;
      case 'blocklists': this.refreshBlockLists(); break;
      case 'websites': this.refreshWebsites(); break;
      case 'apps': this.refreshApps(); break;
      case 'schedule': this.refreshSchedule(); break;
      case 'statistics': this.refreshStatistics(); break;
    }
    refreshIcons();
  },

  async refreshDashboard() {
    try {
      var status = await invoke('get_status');
      document.getElementById('stat-active-blocks').textContent = status.active_blocks.length;
      document.getElementById('stat-blocked-today').textContent = status.total_blocked_today;
      var totalSites = 0, totalApps = 0;
      status.active_blocks.forEach(function(b) { totalSites += b.blocked_websites; totalApps += b.blocked_apps; });
      document.getElementById('stat-total-sites').textContent = totalSites;
      document.getElementById('stat-total-apps').textContent = totalApps;

      this._renderDashboardActiveLists(status.active_blocks);
      await this._renderDashboardRecentActivity();
      await this._renderBrowserStatus();
      await this._renderPomodoroWidget();
      await this._renderAllowanceDashboard();
      refreshIcons();
    } catch (e) {}
  },

  _renderBrowserStatus: async function() {
    var container = document.getElementById('dashboard-browser-status');
    if (!container) return;
    try {
      var data = await invoke('get_browser_status');
      var browsers = (data && data.browsers) || [];
      if (browsers.length === 0) {
        container.innerHTML = '<div class="empty-state">' + t('status.noBrowsersDetected') + '</div>';
        return;
      }

      // Browser icon mapping (lucide names)
      var iconFor = function(displayName) {
        var n = displayName.toLowerCase();
        if (n.indexOf('chrome') !== -1) return 'chrome';
        if (n.indexOf('firefox') !== -1) return 'flame';
        if (n.indexOf('edge') !== -1) return 'globe-2';
        if (n.indexOf('brave') !== -1) return 'shield';
        if (n.indexOf('opera') !== -1) return 'circle';
        return 'globe';
      };

      container.innerHTML = browsers.map(function(b) {
        var statusClass, statusText, statusIcon;
        if (!b.running) {
          statusClass = 'browser-status-off';
          statusText = t('status.notRunning');
          statusIcon = 'circle';
        } else if (b.extension_connected) {
          statusClass = 'browser-status-protected';
          statusText = t('status.extensionActive');
          statusIcon = 'shield-check';
        } else {
          statusClass = 'browser-status-warning';
          statusText = t('status.noExtension');
          statusIcon = 'shield-alert';
        }

        return '<div class="browser-status-row ' + statusClass + '">' +
            '<div class="browser-status-icon">' + ico(iconFor(b.display_name), 18) + '</div>' +
            '<div class="browser-status-name">' + esc(b.display_name) + '</div>' +
            '<div class="browser-status-pill">' +
              ico(statusIcon, 12) +
              '<span>' + statusText + '</span>' +
            '</div>' +
          '</div>';
      }).join('');
    } catch (e) {
      container.innerHTML = '<div class="empty-state">' + t('status.couldNotQueryBrowsers') + '</div>';
    }
  },

  _renderDashboardActiveLists: function(activeBlocks) {
    var container = document.getElementById('dashboard-active-lists');
    if (!activeBlocks || activeBlocks.length === 0) {
      container.innerHTML =
        '<div class="dashboard-empty">' +
          '<div class="dashboard-empty-icon">' + ico('shield-off', 24) + '</div>' +
          '<div class="dashboard-empty-title">' + t('dashboard.noActiveBlocks') + '</div>' +
          '<div class="dashboard-empty-sub">' + t('dashboard.noActiveBlocksDesc') + '</div>' +
          '<button class="btn btn-primary btn-sm" data-page="blocklists" style="margin-top:14px;">' +
            ico('plus', 13) + ' ' + t('dashboard.createABlockList') +
          '</button>' +
        '</div>';
      return;
    }

    // Deterministic color palette — same as block list page
    var palette = [
      { bg: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', shadow: 'rgba(139, 92, 246, 0.35)' },
      { bg: 'linear-gradient(135deg, #60a5fa, #2563eb)', shadow: 'rgba(96, 165, 250, 0.35)' },
      { bg: 'linear-gradient(135deg, #34d399, #059669)', shadow: 'rgba(52, 211, 153, 0.35)' },
      { bg: 'linear-gradient(135deg, #f472b6, #db2777)', shadow: 'rgba(244, 114, 182, 0.35)' },
      { bg: 'linear-gradient(135deg, #fbbf24, #d97706)', shadow: 'rgba(251, 191, 36, 0.35)' },
      { bg: 'linear-gradient(135deg, #f87171, #dc2626)', shadow: 'rgba(248, 113, 113, 0.35)' },
      { bg: 'linear-gradient(135deg, #a78bfa, #7c3aed)', shadow: 'rgba(167, 139, 250, 0.35)' },
      { bg: 'linear-gradient(135deg, #22d3ee, #0891b2)', shadow: 'rgba(34, 211, 238, 0.35)' },
    ];
    function colorFor(name) {
      var h = 0;
      for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
      return palette[h % palette.length];
    }

    container.innerHTML = activeBlocks.map(function(b) {
      var name = b.block_list_name || t('common.unnamed');
      var color = colorFor(name);
      var initial = name.trim().charAt(0).toUpperCase() || '?';
      var avatarStyle = 'background:' + color.bg + ';box-shadow: 0 4px 14px ' + color.shadow + ', inset 0 1px 0 rgba(255,255,255,0.2);';

      return '<div class="mini-list-card" data-list-id="' + b.block_list_id + '">' +
          '<div class="mini-list-avatar" style="' + avatarStyle + '">' + esc(initial) + '</div>' +
          '<div class="mini-list-info">' +
            '<div class="mini-list-name">' + esc(name) + '</div>' +
            '<div class="mini-list-meta">' +
              '<span>' + ico('globe', 12) + ' ' + (b.blocked_websites || 0) + ' ' + t('common.sites') + '</span>' +
              '<span class="dot-sep"></span>' +
              '<span>' + ico('monitor', 12) + ' ' + (b.blocked_apps || 0) + ' ' + t('common.apps') + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="mini-list-pulse" title="' + t('status.active') + '"></div>' +
          '<div class="mini-list-arrow">' + ico('chevron-right', 16) + '</div>' +
        '</div>';
    }).join('');

    // Click handler — navigate to Block Lists page
    container.querySelectorAll('.mini-list-card').forEach(function(el) {
      el.addEventListener('click', function() {
        ui.navigateTo('blocklists');
      });
    });
  },

  _renderDashboardRecentActivity: async function() {
    var container = document.getElementById('dashboard-recent-activity');
    try {
      var now = new Date();
      var from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      var events = await invoke('get_blocked_events', {
        from: from.toISOString(),
        to: now.toISOString()
      });

      if (!events || events.length === 0) {
        container.innerHTML = '<div class="empty-state">' + t('dashboard.noActivity') + '</div>';
        return;
      }

      // Most recent first, limit to 8
      events = events.slice().reverse().slice(0, 8);

      container.innerHTML = events.map(function(e) {
        var domain = e.domain_or_app || 'unknown';
        var isKeyword = domain.indexOf('kw:') === 0;
        var displayName = isKeyword ? domain.substring(3) : domain;
        var iconName = isKeyword ? 'search' : 'shield-alert';
        var ts = new Date(e.timestamp);
        var ago = formatTimeAgo(ts);

        return '<div class="activity-row">' +
            '<div class="activity-icon">' + ico(iconName, 14) + '</div>' +
            '<div class="activity-main">' +
              '<div class="activity-title">' + (isKeyword ? t('dashboard.blockedSearch') : t('dashboard.blockedVisit')) + '</div>' +
              '<div class="activity-sub">' + esc(displayName) + '</div>' +
            '</div>' +
            '<div class="activity-time">' + ago + '</div>' +
          '</div>';
      }).join('');
    } catch (e) {
      container.innerHTML = '<div class="empty-state">' + t('dashboard.noActivity') + '</div>';
    }
  },

  async refreshBlockLists() {
    try { state.blockLists = await invoke('list_block_lists'); } catch (e) { state.blockLists = []; }
    this.renderBlockLists();
    this.updateSelects();
  },

  renderBlockLists: function() {
    var c = document.getElementById('blocklists-container');
    if (state.blockLists.length === 0) { c.innerHTML = '<div class="empty-state">' + t('blocklists.noLists') + '</div>'; return; }

    // Deterministic color palette — each list gets a consistent color based on its name.
    var palette = [
      { bg: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', shadow: 'rgba(139, 92, 246, 0.35)' },
      { bg: 'linear-gradient(135deg, #60a5fa, #2563eb)', shadow: 'rgba(96, 165, 250, 0.35)' },
      { bg: 'linear-gradient(135deg, #34d399, #059669)', shadow: 'rgba(52, 211, 153, 0.35)' },
      { bg: 'linear-gradient(135deg, #f472b6, #db2777)', shadow: 'rgba(244, 114, 182, 0.35)' },
      { bg: 'linear-gradient(135deg, #fbbf24, #d97706)', shadow: 'rgba(251, 191, 36, 0.35)' },
      { bg: 'linear-gradient(135deg, #f87171, #dc2626)', shadow: 'rgba(248, 113, 113, 0.35)' },
      { bg: 'linear-gradient(135deg, #a78bfa, #7c3aed)', shadow: 'rgba(167, 139, 250, 0.35)' },
      { bg: 'linear-gradient(135deg, #22d3ee, #0891b2)', shadow: 'rgba(34, 211, 238, 0.35)' },
    ];
    function colorFor(name) {
      var h = 0;
      for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
      return palette[h % palette.length];
    }

    c.innerHTML = state.blockLists.map(function(l) {
      var hasSchedule = l.schedule !== null && l.schedule !== undefined;
      var alwaysActive = !hasSchedule;
      var color = colorFor(l.name || '?');
      var initial = (l.name || '?').trim().charAt(0).toUpperCase() || '?';

      var statusPill = alwaysActive
        ? '<span class="status-pill status-active">' + ico('check-circle', 12) + ' ' + t('status.alwaysActive') + '</span>'
        : '<span class="status-pill status-scheduled">' + ico('clock', 12) + ' ' + t('status.scheduled') + '</span>';

      var prot = l.protection;
      var isProtected = prot && new Date(prot.expires_at) > new Date();
      var protBadge = '';
      if (isProtected) {
        var remaining = Math.max(0, Math.floor((new Date(prot.expires_at) - new Date()) / 1000));
        var h = Math.floor(remaining / 3600);
        var m = Math.floor((remaining % 3600) / 60);
        var timeStr = h > 0 ? h + 'h ' + m + 'm' : m + 'm';
        protBadge = '<span class="locked-badge">' + ico('lock', 11) + ' ' + t('blocklists.lockedBadge', { time: timeStr }) + '</span>';
      }

      var protBtn = isProtected
        ? '<button class="btn btn-sm btn-ghost" disabled>' + ico('lock', 13) + ' ' + t('status.focusLocked') + '</button>'
        : '<button class="btn btn-sm btn-lock" data-action="focus-lock" data-list-id="' + l.id + '" data-list-name="' + esc(l.name) + '">' + ico('shield-alert', 13) + ' ' + t('modal.focusLock') + '</button>';

      var avatarStyle = 'background:' + color.bg + ';box-shadow: 0 4px 16px ' + color.shadow + ', inset 0 1px 0 rgba(255,255,255,0.2);';
      var enabledClass = l.enabled ? ' is-enabled' : ' is-disabled';

      return '<div class="blocklist-card' + enabledClass + '" data-id="' + l.id + '">' +
        '<div class="blocklist-card-top">' +
          '<div class="blocklist-avatar" style="' + avatarStyle + '">' + esc(initial) + '</div>' +
          '<div class="blocklist-title">' +
            '<div class="blocklist-name-row">' +
              '<span class="blocklist-card-name">' + esc(l.name) + '</span>' +
              (protBadge || '') +
            '</div>' +
            '<div class="blocklist-status-row">' + statusPill + '</div>' +
          '</div>' +
          '<label class="toggle"><input type="checkbox" data-action="toggle-list" data-list-id="' + l.id + '"' + (l.enabled ? ' checked' : '') + (isProtected ? ' disabled' : '') + '><span class="toggle-slider"></span></label>' +
        '</div>' +
        '<div class="blocklist-stats">' +
          '<div class="stat-chip">' +
            '<div class="stat-chip-icon">' + ico('globe', 15) + '</div>' +
            '<div class="stat-chip-text"><span class="stat-chip-value">' + l.websites.length + '</span><span class="stat-chip-label">' + t('common.sites') + '</span></div>' +
          '</div>' +
          '<div class="stat-chip">' +
            '<div class="stat-chip-icon">' + ico('monitor', 15) + '</div>' +
            '<div class="stat-chip-text"><span class="stat-chip-value">' + l.applications.length + '</span><span class="stat-chip-label">' + t('common.apps') + '</span></div>' +
          '</div>' +
          '<div class="stat-chip">' +
            '<div class="stat-chip-icon">' + ico('shield-off', 15) + '</div>' +
            '<div class="stat-chip-text"><span class="stat-chip-value">' + l.exceptions.length + '</span><span class="stat-chip-label">' + t('common.exceptions') + '</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="blocklist-card-actions">' +
          '<button class="btn btn-sm btn-ghost" data-action="edit-list" data-list-id="' + l.id + '">' + ico('pencil', 13) + ' ' + t('common.edit') + '</button>' +
          protBtn +
          '<button class="btn btn-sm btn-ghost" data-action="edit-schedule" data-list-id="' + l.id + '">' + ico('calendar-clock', 13) + ' ' + t('nav.schedule') + '</button>' +
          (isProtected ? '' : '<button class="btn btn-sm btn-ghost btn-danger-ghost" data-action="delete-list" data-list-id="' + l.id + '" data-list-name="' + esc(l.name) + '">' + ico('trash-2', 13) + ' ' + t('common.delete') + '</button>') +
        '</div>' +
      '</div>';
    }).join('');
    refreshIcons();
  },

  updateSelects: function() {
    var opts = state.blockLists.map(function(l) { return '<option value="' + l.id + '">' + esc(l.name) + '</option>'; }).join('');
    var def = '<option value="">' + t('common.selectList') + '</option>';
    ['website-list-select','app-list-select','schedule-list-select','exception-list-select'].forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      var prev = el.value; // save current selection
      el.innerHTML = def + opts;
      if (prev) el.value = prev; // restore selection
      // Sync custom dropdown trigger label
      var wrap = el.closest('.dd-wrap');
      if (wrap && wrap.__ddSync) wrap.__ddSync();
    });
  },

  async toggleList(id, enabled) {
    try {
      await invoke('toggle_block_list', { id: id, enabled: enabled });
      toast(enabled ? t('toast.enabled') : t('toast.disabled'), 'success');
      await this.refreshBlockLists();
    }
    catch (e) { toast(t('common.failed', { error: e }), 'error'); }
  },

  async deleteList(id, name) {
    var ok = await showConfirm(t('confirm.deleteBlockList'), t('confirm.deleteBlockListMsg', { name: name }));
    if (!ok) return;
    try { await invoke('delete_block_list', { id: id }); toast(t('toast.deleted'), 'success'); this.refreshBlockLists(); }
    catch (e) { toast(t('common.failed', { error: e }), 'error'); }
  },

  showCreateListModal: function() {
    document.getElementById('modal-title').textContent = t('modal.newBlockList');
    document.getElementById('modal-body').innerHTML = '<label style="display:block;margin-bottom:6px;font-size:12px;color:var(--text-muted);">' + t('modal.nameLabel') + '</label><input type="text" id="modal-list-name" class="input" style="width:100%;" placeholder="' + t('modal.namePlaceholder') + '">';
    document.getElementById('modal-confirm').textContent = t('common.create');
    document.getElementById('modal-confirm').setAttribute('data-action', 'confirm-create-list');
    document.getElementById('modal-confirm').style.cssText = '';
    document.getElementById('modal-overlay').classList.remove('hidden');
    setTimeout(function() { var i = document.getElementById('modal-list-name'); if (i) i.focus(); }, 80);
  },

  async createList() {
    var i = document.getElementById('modal-list-name');
    var name = i ? i.value.trim() : '';
    if (!name) { toast(t('toast.enterName'), 'error'); return; }
    try { await invoke('create_block_list', { name: name }); toast(t('toast.created'), 'success'); this.closeModal(); this.refreshBlockLists(); }
    catch (e) { toast(t('common.failed', { error: e }), 'error'); }
  },

  closeModal: function() { document.getElementById('modal-overlay').classList.add('hidden'); },

  showFocusLockModal: function(listId, listName) {
    document.getElementById('modal-title').textContent = t('modal.focusLock');
    document.getElementById('modal-body').innerHTML =
      '<p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">' + ico('lock', 15) + ' ' + t('modal.focusLockBody', { name: esc(listName) }) + '</p>' +
      '<label style="display:block;margin-bottom:6px;font-size:12px;color:var(--text-muted);">' + t('modal.duration') + '</label>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">' +
        '<button class="btn btn-sm focus-lock-dur" data-minutes="30" style="font-size:12px;">30m</button>' +
        '<button class="btn btn-sm focus-lock-dur" data-minutes="60" style="font-size:12px;">1h</button>' +
        '<button class="btn btn-sm focus-lock-dur active" data-minutes="120" style="font-size:12px;">2h</button>' +
        '<button class="btn btn-sm focus-lock-dur" data-minutes="300" style="font-size:12px;">5h</button>' +
        '<button class="btn btn-sm focus-lock-dur" data-minutes="480" style="font-size:12px;">8h</button>' +
        '<button class="btn btn-sm focus-lock-dur" data-minutes="1440" style="font-size:12px;">24h</button>' +
      '</div>' +
      '<label style="display:block;margin-bottom:6px;font-size:12px;color:var(--text-muted);">' + t('modal.orEnterMinutes') + '</label>' +
      '<input type="number" id="focus-lock-custom-mins" class="input" style="width:120px;" value="120" min="1" max="14400">' +
      '<p style="font-size:11px;color:var(--text-muted);margin-top:14px;opacity:0.7;">' + ico('alert-triangle', 12) + ' ' + t('modal.focusLockWarning') + '</p>';

    document.getElementById('modal-confirm').textContent = t('modal.activateLock');
    document.getElementById('modal-confirm').setAttribute('data-action', 'confirm-focus-lock');
    document.getElementById('modal-confirm').setAttribute('data-list-id', listId);
    document.getElementById('modal-confirm').style.cssText = 'background:var(--error-dim);color:var(--error);';
    document.getElementById('modal-overlay').classList.remove('hidden');
    refreshIcons();

    // Duration button selection
    document.querySelectorAll('.focus-lock-dur').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.focus-lock-dur').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var input = document.getElementById('focus-lock-custom-mins');
        if (input) input.value = btn.getAttribute('data-minutes');
      });
    });
  },

  async activateFocusLock(listId) {
    var minsInput = document.getElementById('focus-lock-custom-mins');
    var mins = minsInput ? parseInt(minsInput.value, 10) : 120;
    if (!mins || mins < 1) { toast(t('toast.enterValidDuration'), 'error'); return; }

    var ok = await showConfirm(t('confirm.focusLock'),
      t('confirm.focusLockMsg', { mins: mins }));
    if (!ok) return;

    try {
      await invoke('enable_protection', {
        listId: listId,
        durationMinutes: mins,
        preventUninstall: false,
        preventServiceStop: false,
        preventModification: true,
      });
      toast(t('toast.focusLockActivated', { mins: mins }), 'success');
      this.closeModal();
      this.refreshBlockLists();
    } catch (e) {
      toast(t('common.failed', { error: e }), 'error');
    }
  },

  refreshWebsites: function() {
    this.updateSelects();
    var selectedList = document.getElementById('website-list-select').value;
    state.allWebsiteRules = [];
    state.blockLists.forEach(function(l) {
      if (selectedList && l.id !== selectedList) return;
      l.websites.forEach(function(r) { state.allWebsiteRules.push({ id: r.id, match_type: r.match_type, listName: l.name, listId: l.id }); });
    });
    var searchEl = document.getElementById('search-websites');
    if (searchEl) searchEl.value = '';
    // Schedule info bar
    var schedBar = document.getElementById('website-schedule-bar');
    if (!schedBar) {
      schedBar = document.createElement('div');
      schedBar.id = 'website-schedule-bar';
      schedBar.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--border);font-size:12px;';
      var websitesList = document.getElementById('websites-list');
      if (websitesList) websitesList.parentElement.insertBefore(schedBar, websitesList);
    }

    if (!selectedList) {
      schedBar.style.display = 'none';
      var c = document.getElementById('websites-list');
      c.innerHTML = '<div class="empty-state">' + t('websites.selectListToView') + '</div>';
      return;
    }

    // Show schedule status for selected list
    var selList = state.blockLists.find(function(l) { return l.id === selectedList; });
    var isScheduled = selList && selList.schedule !== null && selList.schedule !== undefined;
    var slotCount = isScheduled && selList.schedule.time_slots ? selList.schedule.time_slots.length : 0;
    schedBar.style.display = 'flex';
    schedBar.innerHTML = '<span style="color:var(--text-muted);">' + t('websites.schedule') + ':</span>' +
      (isScheduled
        ? '<span style="color:var(--accent);font-weight:500;">' + t('status.scheduled') + (slotCount > 0 ? ' (' + t('websites.slots', { count: slotCount }) + ')' : ' (' + t('websites.noHoursSet') + ')') + '</span>'
        : '<span style="color:var(--success);font-weight:500;">' + t('websites.alwaysActiveShort') + '</span>') +
      '<button class="btn btn-sm" data-action="edit-schedule" data-list-id="' + selectedList + '" style="font-size:11px;margin-left:auto;">' + t('websites.editSchedule') + '</button>';

    this.renderFilteredWebsites('');
  },

  renderFilteredWebsites: function(query) {
    var c = document.getElementById('websites-list');
    var all = state.allWebsiteRules || [];
    if (query) {
      var q = query.toLowerCase();
      all = all.filter(function(r) {
        var v = mtVal(r.match_type).toLowerCase();
        var n = r.listName.toLowerCase();
        return v.indexOf(q) !== -1 || n.indexOf(q) !== -1;
      });
    }
    if (all.length === 0) {
      c.innerHTML = '<div class="empty-state">' + (query ? t('common.noMatch', { query: query }) : t('websites.noWebsitesBlocked')) + '</div>';
      return;
    }
    c.innerHTML = all.map(function(r) {
      var t = mtName(r.match_type), v = mtVal(r.match_type);
      return '<div class="rule-item"><div class="rule-info"><span class="rule-type-badge ' + t + '">' + t + '</span><span class="rule-value">' + esc(v) + '</span><span class="rule-list-name">' + esc(r.listName) + '</span></div>' +
        '<button class="btn-icon" data-action="remove-website" data-list-id="' + r.listId + '" data-rule-id="' + r.id + '">' + ico('x', 14) + '</button></div>';
    }).join('');
    refreshIcons();
  },

  async addWebsite() {
    var lid = document.getElementById('website-list-select').value;
    var rt = document.getElementById('website-type-select').value;
    var v = document.getElementById('website-input').value.trim();
    if (!lid) { toast(t('toast.selectListFirst'), 'error'); return; }
    if (!v) { toast(t('toast.enterWebsite'), 'error'); return; }
    try { await invoke('add_website_rule', { listId: lid, ruleType: rt, value: v }); document.getElementById('website-input').value = ''; toast(t('toast.blocked', { name: v }), 'success'); await this.refreshBlockLists(); this.refreshWebsites(); }
    catch (e) { toast(t('common.failed', { error: e }), 'error'); }
  },

  async removeWebsite(lid, rid) {
    try { await invoke('remove_website_rule', { listId: lid, ruleId: rid }); toast(t('toast.removed'), 'success'); await this.refreshBlockLists(); this.refreshWebsites(); }
    catch (e) { toast(t('common.failed', { error: e }), 'error'); }
  },

  refreshApps: function() {
    this.updateSelects();
    var selectedList = document.getElementById('app-list-select').value;
    state.allAppRules = [];
    state.blockLists.forEach(function(l) {
      if (selectedList && l.id !== selectedList) return;
      l.applications.forEach(function(r) { state.allAppRules.push({ id: r.id, match_type: r.match_type, listName: l.name, listId: l.id }); });
    });
    var searchEl = document.getElementById('search-apps');
    if (searchEl) searchEl.value = '';
    if (!selectedList) {
      var c = document.getElementById('apps-list');
      c.innerHTML = '<div class="empty-state">' + t('apps.selectListToViewApps') + '</div>';
      return;
    }
    this.renderFilteredApps('');
  },

  renderFilteredApps: function(query) {
    var c = document.getElementById('apps-list');
    var all = state.allAppRules || [];
    if (query) {
      var q = query.toLowerCase();
      all = all.filter(function(r) {
        var v = amtVal(r.match_type).toLowerCase();
        var n = r.listName.toLowerCase();
        return v.indexOf(q) !== -1 || n.indexOf(q) !== -1;
      });
    }
    if (all.length === 0) {
      c.innerHTML = '<div class="empty-state">' + (query ? t('common.noMatch', { query: query }) : t('apps.noAppsBlocked')) + '</div>';
      return;
    }
    c.innerHTML = all.map(function(r) {
      var t = amtName(r.match_type), v = amtVal(r.match_type);
      return '<div class="rule-item"><div class="rule-info"><span class="rule-type-badge">' + t + '</span><span class="rule-value">' + esc(v) + '</span><span class="rule-list-name">' + esc(r.listName) + '</span></div>' +
        '<button class="btn-icon" data-action="remove-app" data-list-id="' + r.listId + '" data-rule-id="' + r.id + '">' + ico('x', 14) + '</button></div>';
    }).join('');
    refreshIcons();
  },

  async addApp() {
    var lid = document.getElementById('app-list-select').value;
    var v = document.getElementById('app-input').value.trim();
    if (!lid) { toast(t('toast.selectListFirst'), 'error'); return; }
    if (!v) { toast(t('toast.enterApp'), 'error'); return; }
    // Auto-detect type: if it ends with .exe it's exe_name, if it has path separators it's exe_path
    var rt = 'exe_name';
    if (v.indexOf('\\') !== -1 || v.indexOf('/') !== -1) rt = 'exe_path';
    try { await invoke('add_app_rule', { listId: lid, ruleType: rt, value: v }); document.getElementById('app-input').value = ''; toast(t('toast.blocked', { name: v }), 'success'); await this.refreshBlockLists(); this.refreshApps(); }
    catch (e) { toast(t('common.failed', { error: e }), 'error'); }
  },

  async removeApp(lid, rid) {
    try { await invoke('remove_app_rule', { listId: lid, ruleId: rid }); toast(t('toast.removed'), 'success'); await this.refreshBlockLists(); this.refreshApps(); }
    catch (e) { toast(t('common.failed', { error: e }), 'error'); }
  },

  async browseApps() {
    var lid = document.getElementById('app-list-select').value;
    if (!lid) { toast(t('toast.selectListFirst'), 'error'); return; }

    try {
      // Use Tauri's Rust-side file picker command
      var result = await invoke('pick_app_file');
      if (result) {
        await invoke('add_app_rule', { listId: lid, ruleType: 'exe_name', value: result });
        toast(t('toast.blocked', { name: result }), 'success');
        await this.refreshBlockLists();
        this.refreshApps();
      }
    } catch (e) {
      if (e && e.toString().indexOf('cancel') === -1) {
        toast(t('common.failed', { error: e }), 'error');
      }
    }
  },

  refreshSchedule: function() {
    this.updateSelects();
    var grid = document.getElementById('schedule-grid');
    var days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    var dayLabels = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

    // Build the grid: day label + 24 hour cells per row
    var html = '';
    for (var d = 0; d < days.length; d++) {
      html += '<div class="schedule-day-label" title="' + dayLabels[d] + '">' + days[d] + '</div>';
      for (var hr = 0; hr < 24; hr++) {
        var hourLabel = (hr === 0 ? '12a' : (hr < 12 ? hr + 'a' : (hr === 12 ? '12p' : (hr - 12) + 'p')));
        html += '<div class="schedule-cell" data-day="' + days[d] + '" data-hour="' + hr + '" title="' + dayLabels[d] + ' ' + hourLabel + '"></div>';
      }
    }
    grid.innerHTML = html;

    var sel = document.getElementById('schedule-list-select');
    var heroPanel = document.getElementById('schedule-hero');
    var gridPanel = document.getElementById('schedule-grid-panel');
    var emptyPanel = document.getElementById('schedule-empty');
    var modeAlways = document.getElementById('mode-always');
    var modeScheduled = document.getElementById('mode-scheduled');
    var summaryValue = document.getElementById('schedule-summary-value');
    var summaryLabel = document.getElementById('schedule-summary-label');

    if (!sel || !sel.value) {
      // No list selected
      if (heroPanel) heroPanel.style.display = 'none';
      if (gridPanel) gridPanel.style.display = 'none';
      if (emptyPanel) emptyPanel.style.display = 'block';
      if (modeAlways) modeAlways.classList.add('active');
      if (modeScheduled) modeScheduled.classList.remove('active');
      if (summaryValue) summaryValue.textContent = '—';
      if (summaryLabel) summaryLabel.textContent = t('schedule.selectBlockList');
      this._setupScheduleDrag(grid);
      refreshIcons();
      return;
    }

    var list = state.blockLists.find(function(l) { return l.id === sel.value; });
    var isScheduled = list && list.schedule !== null && list.schedule !== undefined;
    var slots = (isScheduled && list.schedule.time_slots) || [];

    // If user just switched to Scheduled mode, treat as scheduled even if no slots yet
    var mode = (isScheduled || this._scheduleManualMode) ? 'scheduled' : 'always';

    if (emptyPanel) emptyPanel.style.display = 'none';

    if (mode === 'always') {
      if (heroPanel) heroPanel.style.display = 'block';
      if (gridPanel) gridPanel.style.display = 'none';
      if (modeAlways) modeAlways.classList.add('active');
      if (modeScheduled) modeScheduled.classList.remove('active');
      if (summaryValue) summaryValue.textContent = '24/7';
      if (summaryLabel) summaryLabel.textContent = t('schedule.alwaysBlocking');
    } else {
      if (heroPanel) heroPanel.style.display = 'none';
      if (gridPanel) gridPanel.style.display = 'block';
      if (modeAlways) modeAlways.classList.remove('active');
      if (modeScheduled) modeScheduled.classList.add('active');
      var hoursCount = slots.length;
      if (summaryValue) summaryValue.textContent = hoursCount + 'h';
      if (summaryLabel) summaryLabel.textContent = t('schedule.perWeekBlocked');

      // Populate active cells
      slots.forEach(function(slot) {
        var dayKey = slot.day;
        if (dayKey === 'Monday') dayKey = 'Mon';
        else if (dayKey === 'Tuesday') dayKey = 'Tue';
        else if (dayKey === 'Wednesday') dayKey = 'Wed';
        else if (dayKey === 'Thursday') dayKey = 'Thu';
        else if (dayKey === 'Friday') dayKey = 'Fri';
        else if (dayKey === 'Saturday') dayKey = 'Sat';
        else if (dayKey === 'Sunday') dayKey = 'Sun';
        var startHour = parseInt(slot.start.split(':')[0], 10);
        var cell = grid.querySelector('[data-day="' + dayKey + '"][data-hour="' + startHour + '"]');
        if (cell) cell.classList.add('active');
      });
    }

    this._setupScheduleDrag(grid);
    refreshIcons();
  },

  _applySchedulePreset: async function(preset) {
    var grid = document.getElementById('schedule-grid');
    if (!grid) return;
    var cells = grid.querySelectorAll('.schedule-cell');
    cells.forEach(function(c) { c.classList.remove('active'); });

    var weekdays = ['Mon','Tue','Wed','Thu','Fri'];
    var weekends = ['Sat','Sun'];
    var allDays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

    function activate(days, hours) {
      days.forEach(function(d) {
        hours.forEach(function(h) {
          var cell = grid.querySelector('[data-day="' + d + '"][data-hour="' + h + '"]');
          if (cell) cell.classList.add('active');
        });
      });
    }

    if (preset === 'weekdays-work') {
      activate(weekdays, [9, 10, 11, 12, 13, 14, 15, 16]);
    } else if (preset === 'evenings') {
      activate(allDays, [18, 19, 20, 21, 22]);
    } else if (preset === 'weekends') {
      activate(weekends, [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]);
    } else if (preset === 'all') {
      activate(allDays, [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]);
    }

    // Preset switches to scheduled mode and must persist + refresh state
    this._scheduleManualMode = true;
    await this._saveSchedule();
  },

  _updateScheduleSummary: function() {
    var grid = document.getElementById('schedule-grid');
    if (!grid) return;
    var activeCount = grid.querySelectorAll('.schedule-cell.active').length;
    var summaryValue = document.getElementById('schedule-summary-value');
    var summaryLabel = document.getElementById('schedule-summary-label');
    if (summaryValue) summaryValue.textContent = activeCount + 'h';
    if (summaryLabel) summaryLabel.textContent = t('schedule.perWeekBlocked');
  },

  _setupScheduleDrag: function(grid) {
    if (grid._dragSetup) return;
    grid._dragSetup = true;
    var isDragging = false;
    var dragMode = null; // 'activate' or 'deactivate'

    grid.addEventListener('mousedown', function(e) {
      var cell = e.target.closest('.schedule-cell');
      if (!cell) return;
      e.preventDefault();
      isDragging = true;
      dragMode = cell.classList.contains('active') ? 'deactivate' : 'activate';
      cell.classList.toggle('active', dragMode === 'activate');
      ui._updateScheduleSummary();
    });

    grid.addEventListener('mouseover', function(e) {
      if (!isDragging) return;
      var cell = e.target.closest('.schedule-cell');
      if (!cell) return;
      cell.classList.toggle('active', dragMode === 'activate');
      ui._updateScheduleSummary();
    });

    document.addEventListener('mouseup', function() {
      if (isDragging) {
        isDragging = false;
        dragMode = null;
        ui._saveSchedule();
        ui._updateScheduleSummary();
      }
    });

    // Single click: mouseup handler above already saves after drag ends.
    // Only save here if mouseup didn't fire (edge case: click without drag state).
    grid.addEventListener('click', function(e) {
      var cell = e.target.closest('.schedule-cell');
      if (!cell) return;
      ui._updateScheduleSummary();
    });
  },

  _saveSchedule: async function(forceAlwaysActive) {
    var sel = document.getElementById('schedule-list-select');
    if (!sel || !sel.value) { toast(t('toast.selectListFirst'), 'error'); return; }

    if (forceAlwaysActive) {
      // Clear schedule — set to always active
      try {
        await invoke('update_schedule', { listId: sel.value, slots: [], alwaysActive: true });
        await this.refreshBlockLists();
      } catch (e) { toast(t('common.failed', { error: e }), 'error'); }
      return;
    }

    var grid = document.getElementById('schedule-grid');
    var activeCells = grid.querySelectorAll('.schedule-cell.active');
    var slots = [];
    activeCells.forEach(function(cell) {
      slots.push({ day: cell.getAttribute('data-day'), hour: parseInt(cell.getAttribute('data-hour'), 10) });
    });
    try {
      await invoke('update_schedule', { listId: sel.value, slots: slots, alwaysActive: false });
      await this.refreshBlockLists();
    } catch (e) { toast(t('toast.scheduleSaveFailed', { error: e }), 'error'); }
  },

  _statsRange: '1d',

  async refreshStatistics() {
    var c = document.getElementById('stats-content');

    // Highlight active range button
    document.querySelectorAll('.stats-range-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-range') === ui._statsRange);
    });

    // Fetch daily stats for bar chart + table
    var today = new Date().toISOString().split('T')[0];
    var week = new Date(Date.now() - 7*86400000).toISOString().split('T')[0];
    try {
      var stats = await invoke('get_stats', { from: week, to: today });
      this._renderBarChart(stats || []);
      this._renderStatsTable(stats || [], c);
    } catch (e) { c.innerHTML = '<div class="empty-state">' + t('common.noData') + '</div>'; }

    // Fetch fine-grained events for line chart
    var rangeMs = this._rangeToMs(this._statsRange);
    var now = new Date();
    var from = new Date(now.getTime() - rangeMs);
    try {
      var events = await invoke('get_blocked_events', { from: from.toISOString(), to: now.toISOString() });
      this._renderLineChart(events || [], from, now);
    } catch (e) { /* no events yet */ }

    // Focus history panels
    await this._renderPomodoroHistory();
    await this._renderAllowanceSummary();
    refreshIcons();
  },

  _renderPomodoroHistory: async function() {
    var c = document.getElementById('stats-pomodoro-history');
    if (!c) return;
    try {
      var rows = await invoke('pomodoro_history', { days: 30 });
      if (!rows || !rows.length) {
        c.innerHTML = '<div class="empty-state">' + t('statistics.noSessions') + '</div>';
        return;
      }
      var total_cycles = 0, total_secs = 0;
      rows.forEach(function(r) { total_cycles += r.completed_cycles; total_secs += r.total_work_secs; });

      var listHtml = rows.slice(0, 8).map(function(r) {
        var d = new Date(r.started_at);
        var when = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:12px;">' +
          '<span style="color:var(--text-muted);">' + escapeHtml(when) + '</span>' +
          '<span style="color:var(--text);font-weight:600;">' + r.completed_cycles + ' ' + t('statistics.cycleUnit') + (r.completed_cycles === 1 ? '' : 's') + '</span>' +
        '</div>';
      }).join('');

      c.innerHTML =
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px 14px 12px;">' +
          '<div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;">' + t('statistics.sessions') + '</div><div style="font-size:24px;font-weight:700;color:var(--text);">' + rows.length + '</div></div>' +
          '<div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;">' + t('statistics.cyclesCompleted') + '</div><div style="font-size:24px;font-weight:700;color:var(--text);">' + total_cycles + '</div></div>' +
          '<div style="grid-column:1/-1;"><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;">' + t('statistics.totalFocusTime') + '</div><div style="font-size:16px;font-weight:600;color:var(--text);">' + t('statistics.minutes', { n: Math.round(total_secs / 60) }) + '</div></div>' +
        '</div>' +
        '<div style="padding:0 14px 10px;">' + listHtml + '</div>';
    } catch (e) {
      c.innerHTML = '<div class="empty-state">' + t('common.unableToLoad') + '</div>';
    }
  },

  _renderAllowanceSummary: async function() {
    var c = document.getElementById('stats-allowance-summary');
    if (!c) return;
    try {
      var list = await invoke('allowance_list');
      if (!list || !list.length) {
        c.innerHTML = '<div class="empty-state">' + t('statistics.noAllowancesConfigured') + '</div>';
        return;
      }
      c.innerHTML = '<div style="padding:10px 14px;">' + list.map(ui._renderAllowanceRow).join('') + '</div>';
      refreshIcons();
    } catch (e) {
      c.innerHTML = '<div class="empty-state">' + t('common.unableToLoad') + '</div>';
    }
  },

  _rangeToMs: function(range) {
    switch (range) {
      case '5m': return 5 * 60 * 1000;
      case '10m': return 10 * 60 * 1000;
      case '30m': return 30 * 60 * 1000;
      case '1h': return 60 * 60 * 1000;
      case '1d': return 24 * 60 * 60 * 1000;
      case '7d': return 7 * 24 * 60 * 60 * 1000;
      case '30d': return 30 * 24 * 60 * 60 * 1000;
      default: return 24 * 60 * 60 * 1000;
    }
  },

  _chartColors: ['#8b5cf6','#4e8fff','#22c55e','#f59e0b','#ef4444','#ec4899','#06b6d4','#84cc16','#f97316','#6366f1'],

  _renderLineChart: function(events, fromDate, toDate) {
    var canvas = document.getElementById('stats-line-chart');
    var tooltipEl = document.getElementById('stats-line-tooltip');
    var legendEl = document.getElementById('stats-line-legend');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    var w = rect.width, h = rect.height;
    var pad = { top: 20, right: 20, bottom: 36, left: 44 };
    var chartW = w - pad.left - pad.right;
    var chartH = h - pad.top - pad.bottom;
    ctx.clearRect(0, 0, w, h);

    if (events.length === 0) {
      ctx.fillStyle = '#5e5e72';
      ctx.font = '13px Inter, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('statistics.noEvents'), w / 2, h / 2);
      if (legendEl) legendEl.innerHTML = '';
      return;
    }

    // Determine time buckets
    var rangeMs = toDate.getTime() - fromDate.getTime();
    var bucketCount = Math.min(30, Math.max(6, Math.floor(chartW / 40)));
    var bucketMs = rangeMs / bucketCount;
    var colors = this._chartColors;

    // Find unique domains and assign colors
    var domainSet = {};
    events.forEach(function(e) { domainSet[e.domain_or_app] = true; });
    var domains = Object.keys(domainSet).sort();
    var domainColors = {};
    domains.forEach(function(dom, i) { domainColors[dom] = colors[i % colors.length]; });

    // Bucket events per domain
    var buckets = {};
    domains.forEach(function(dom) {
      buckets[dom] = new Array(bucketCount).fill(0);
    });
    events.forEach(function(e) {
      var t = new Date(e.timestamp).getTime();
      var bi = Math.floor((t - fromDate.getTime()) / bucketMs);
      if (bi >= bucketCount) bi = bucketCount - 1;
      if (bi < 0) bi = 0;
      if (buckets[e.domain_or_app]) buckets[e.domain_or_app][bi]++;
    });

    // Max value for Y scale
    var maxVal = 1;
    for (var bi = 0; bi < bucketCount; bi++) {
      domains.forEach(function(dom) { if (buckets[dom][bi] > maxVal) maxVal = buckets[dom][bi]; });
    }

    // Grid
    var gridLines = 4;
    ctx.strokeStyle = '#1c1c28';
    ctx.lineWidth = 1;
    ctx.font = '11px Inter, -apple-system, sans-serif';
    ctx.fillStyle = '#5e5e72';
    ctx.textAlign = 'right';
    for (var gi = 0; gi <= gridLines; gi++) {
      var gy = pad.top + (chartH / gridLines) * gi;
      var gval = Math.round(maxVal - (maxVal / gridLines) * gi);
      ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(w - pad.right, gy); ctx.stroke();
      ctx.fillText(gval.toString(), pad.left - 8, gy + 4);
    }

    // Draw lines per domain
    var stepX = chartW / (bucketCount - 1 || 1);
    var self = this;
    this._lineChartPoints = [];

    domains.forEach(function(dom) {
      var color = domainColors[dom];
      var vals = buckets[dom];

      // Area fill
      ctx.beginPath();
      for (var i = 0; i < bucketCount; i++) {
        var x = pad.left + i * stepX;
        var y = pad.top + chartH - (vals[i] / maxVal) * chartH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineTo(pad.left + (bucketCount - 1) * stepX, pad.top + chartH);
      ctx.lineTo(pad.left, pad.top + chartH);
      ctx.closePath();
      var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
      grad.addColorStop(0, color + '20');
      grad.addColorStop(1, color + '03');
      ctx.fillStyle = grad;
      ctx.fill();

      // Line
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      for (var i = 0; i < bucketCount; i++) {
        var x = pad.left + i * stepX;
        var y = pad.top + chartH - (vals[i] / maxVal) * chartH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Points + hover data
      for (var i = 0; i < bucketCount; i++) {
        var x = pad.left + i * stepX;
        var y = pad.top + chartH - (vals[i] / maxVal) * chartH;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        self._lineChartPoints.push({ x: x, y: y, domain: dom, count: vals[i], bucketIndex: i, color: color });
      }
    });

    // X labels
    ctx.fillStyle = '#5e5e72';
    ctx.textAlign = 'center';
    ctx.font = '10px Inter, -apple-system, sans-serif';
    var labelStep = Math.max(1, Math.floor(bucketCount / 7));
    for (var li = 0; li < bucketCount; li += labelStep) {
      var lx = pad.left + li * stepX;
      var lt = new Date(fromDate.getTime() + li * bucketMs);
      var label = rangeMs <= 3600000 ? lt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) :
                  rangeMs <= 86400000 ? lt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) :
                  (lt.getMonth()+1) + '/' + lt.getDate();
      ctx.fillText(label, lx, h - pad.bottom + 14);
    }

    // Legend
    if (legendEl) {
      legendEl.innerHTML = domains.map(function(dom) {
        return '<div style="display:flex;align-items:center;gap:6px;">' +
          '<div style="width:10px;height:10px;border-radius:3px;background:' + domainColors[dom] + ';flex-shrink:0;"></div>' +
          '<span style="font-size:12px;color:var(--text-secondary);font-family:var(--font-mono);">' + esc(dom) + '</span></div>';
      }).join('');
    }

    // Hover
    if (!this._lineHoverBound) {
      this._lineHoverBound = true;
      canvas.addEventListener('mousemove', function(e) {
        var cr = canvas.getBoundingClientRect();
        var mx = e.clientX - cr.left, my = e.clientY - cr.top;
        var hit = null, minDist = 20;
        (self._lineChartPoints || []).forEach(function(p) {
          var d = Math.sqrt((mx - p.x) * (mx - p.x) + (my - p.y) * (my - p.y));
          if (d < minDist) { minDist = d; hit = p; }
        });
        if (hit && tooltipEl) {
          var bt = new Date(fromDate.getTime() + hit.bucketIndex * bucketMs);
          tooltipEl.style.display = 'block';
          tooltipEl.innerHTML = '<div style="font-weight:600;color:var(--text-primary);margin-bottom:4px;">' + esc(hit.domain) + '</div>' +
            '<div style="color:var(--text-secondary);"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' + hit.color + ';margin-right:6px;"></span>' + t('statistics.blockedCount', { count: hit.count }) + '</div>' +
            '<div style="color:var(--text-muted);font-size:11px;margin-top:2px;">' + bt.toLocaleString() + '</div>';
          var tx = hit.x + 14;
          if (tx + 180 > w) tx = hit.x - 180;
          tooltipEl.style.left = tx + 'px';
          tooltipEl.style.top = Math.max(0, hit.y - 30) + 'px';
          canvas.style.cursor = 'crosshair';
        } else {
          if (tooltipEl) tooltipEl.style.display = 'none';
          canvas.style.cursor = 'default';
        }
      });
      canvas.addEventListener('mouseleave', function() {
        if (tooltipEl) tooltipEl.style.display = 'none';
      });
    }
  },

  _renderBarChart: function(stats) {
    var chartCanvas = document.getElementById('stats-chart');
    var legendEl = document.getElementById('stats-legend');
    var tooltipEl = document.getElementById('stats-tooltip');

    if (!stats || stats.length === 0) {
      if (legendEl) legendEl.innerHTML = '';
      if (chartCanvas) { var ctx2 = chartCanvas.getContext('2d'); ctx2.clearRect(0, 0, chartCanvas.width, chartCanvas.height); }
      return;
    }

    var colors = this._chartColors;

    // Get 7-day date range
    var today = new Date().toISOString().split('T')[0];
    var weekAgo = new Date(Date.now() - 7*86400000).toISOString().split('T')[0];
    var dates = [];
    for (var d = new Date(weekAgo); d <= new Date(today); d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d).toISOString().split('T')[0]);
    }
    var domainSet = {};
    stats.forEach(function(s) { domainSet[s.domain_or_app] = true; });
    var domains = Object.keys(domainSet).sort();

    var matrix = {};
    domains.forEach(function(dom) { matrix[dom] = {}; dates.forEach(function(dt) { matrix[dom][dt] = 0; }); });
    stats.forEach(function(s) { if (matrix[s.domain_or_app] && matrix[s.domain_or_app][s.date] !== undefined) matrix[s.domain_or_app][s.date] = s.blocked_attempts; });

    var domainColors = {};
    domains.forEach(function(dom, i) { domainColors[dom] = colors[i % colors.length]; });

    this._statsChartData = { dates: dates, domains: domains, matrix: matrix, domainColors: domainColors };
    this._drawStatsChart();

    if (legendEl) {
      legendEl.innerHTML = domains.map(function(dom) {
        return '<div style="display:flex;align-items:center;gap:6px;">' +
          '<div style="width:10px;height:10px;border-radius:3px;background:' + domainColors[dom] + ';flex-shrink:0;"></div>' +
          '<span style="font-size:12px;color:var(--text-secondary);font-family:var(--font-mono);">' + esc(dom) + '</span></div>';
      }).join('');
    }
  },

  _renderStatsTable: function(stats, container) {
    if (!stats || stats.length === 0) {
      container.innerHTML = '<div class="empty-state">' + t('statistics.noStatsYet') + '</div>';
      return;
    }
    var colors = this._chartColors;
    var domainColors = {};
    var di = 0;
    stats.forEach(function(s) { if (!domainColors[s.domain_or_app]) { domainColors[s.domain_or_app] = colors[di % colors.length]; di++; } });

    var html = '<table class="data-table"><thead><tr><th>' + t('statistics.tableDomainApp') + '</th><th>' + t('statistics.tableBlocked') + '</th><th>' + t('statistics.tableDate') + '</th></tr></thead><tbody>';
    stats.forEach(function(s) {
      var color = domainColors[s.domain_or_app] || 'var(--text-primary)';
      html += '<tr><td style="font-family:var(--font-mono);font-size:13px;">' +
        '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' + color + ';margin-right:8px;vertical-align:middle;"></span>' +
        '<span class="rule-value">' + esc(s.domain_or_app) + '</span></td>' +
        '<td>' + s.blocked_attempts + '</td>' +
        '<td style="color:var(--text-muted)">' + s.date + '</td></tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  },

  _drawStatsChart: function() {
    var canvas = document.getElementById('stats-chart');
    var tooltipEl = document.getElementById('stats-tooltip');
    if (!canvas || !this._statsChartData) return;

    var data = this._statsChartData;
    var dates = data.dates, domains = data.domains, matrix = data.matrix, domainColors = data.domainColors;

    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    var w = rect.width, h = rect.height;
    var pad = { top: 20, right: 20, bottom: 36, left: 44 };
    var chartW = w - pad.left - pad.right;
    var chartH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    // Calculate stacked totals per date
    var maxTotal = 1;
    var stackedTotals = dates.map(function(dt) {
      var total = 0;
      domains.forEach(function(dom) { total += matrix[dom][dt]; });
      if (total > maxTotal) maxTotal = total;
      return total;
    });

    // Grid lines
    var gridLines = 4;
    ctx.strokeStyle = '#1c1c28';
    ctx.lineWidth = 1;
    ctx.font = '11px Inter, -apple-system, sans-serif';
    ctx.fillStyle = '#5e5e72';
    ctx.textAlign = 'right';
    for (var i = 0; i <= gridLines; i++) {
      var y = pad.top + (chartH / gridLines) * i;
      var val = Math.round(maxTotal - (maxTotal / gridLines) * i);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.fillText(val.toString(), pad.left - 8, y + 4);
    }

    // Bars
    var barCount = dates.length;
    var barGap = Math.max(6, chartW * 0.06);
    var barWidth = Math.max(16, (chartW - barGap * (barCount + 1)) / barCount);
    var barRadius = Math.min(4, barWidth / 2);

    // Store bar positions for hover detection
    this._statsBarRects = [];

    for (var di = 0; di < barCount; di++) {
      var x = pad.left + barGap + di * (barWidth + barGap);
      var stackY = pad.top + chartH; // bottom of chart

      for (var si = 0; si < domains.length; si++) {
        var dom = domains[si];
        var count = matrix[dom][dates[di]];
        if (count === 0) continue;
        var segH = (count / maxTotal) * chartH;
        var segY = stackY - segH;

        ctx.fillStyle = domainColors[dom];

        // Round top corners only for the topmost segment
        var isTop = true;
        for (var ck = si + 1; ck < domains.length; ck++) {
          if (matrix[domains[ck]][dates[di]] > 0) { isTop = false; break; }
        }

        if (isTop && barRadius > 0) {
          ctx.beginPath();
          ctx.moveTo(x, segY + barRadius);
          ctx.arcTo(x, segY, x + barRadius, segY, barRadius);
          ctx.arcTo(x + barWidth, segY, x + barWidth, segY + barRadius, barRadius);
          ctx.lineTo(x + barWidth, stackY);
          ctx.lineTo(x, stackY);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillRect(x, segY, barWidth, segH);
        }

        this._statsBarRects.push({ x: x, y: segY, w: barWidth, h: segH, domain: dom, date: dates[di], count: count });
        stackY = segY;
      }

      // Date label
      ctx.fillStyle = '#5e5e72';
      ctx.textAlign = 'center';
      ctx.font = '11px Inter, -apple-system, sans-serif';
      var label = dates[di].substring(5); // MM-DD
      ctx.fillText(label, x + barWidth / 2, h - pad.bottom + 16);
    }

    // ── Hover interaction ───────────────────────────────
    var self = this;
    if (!this._statsHoverBound) {
      this._statsHoverBound = true;
      canvas.addEventListener('mousemove', function(e) {
        var crect = canvas.getBoundingClientRect();
        var mx = e.clientX - crect.left;
        var my = e.clientY - crect.top;
        var hit = null;
        var rects = self._statsBarRects || [];
        for (var i = rects.length - 1; i >= 0; i--) {
          var r = rects[i];
          if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) { hit = r; break; }
        }
        if (hit && tooltipEl) {
          tooltipEl.style.display = 'block';
          tooltipEl.innerHTML = '<div style="font-weight:600;color:var(--text-primary);margin-bottom:4px;">' + esc(hit.domain) + '</div>' +
            '<div style="color:var(--text-secondary);"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' + domainColors[hit.domain] + ';margin-right:6px;"></span>' + hit.count + ' blocked</div>' +
            '<div style="color:var(--text-muted);font-size:11px;margin-top:2px;">' + hit.date + '</div>';
          var tx = hit.x + hit.w + 12;
          var ty = hit.y;
          if (tx + 160 > w) tx = hit.x - 160;
          if (ty + 80 > h) ty = h - 80;
          tooltipEl.style.left = tx + 'px';
          tooltipEl.style.top = ty + 'px';
          canvas.style.cursor = 'pointer';
        } else {
          if (tooltipEl) tooltipEl.style.display = 'none';
          canvas.style.cursor = 'default';
        }
      });
      canvas.addEventListener('mouseleave', function() {
        if (tooltipEl) tooltipEl.style.display = 'none';
        canvas.style.cursor = 'default';
      });
    }
  },

  // ── Exceptions ──────────────────────────────────────────────
  refreshExceptions: function() {
    this.updateSelects();
    var sel = document.getElementById('exception-list-select');
    if (sel) {
      var opts = state.blockLists.map(function(l) { return '<option value="' + l.id + '">' + esc(l.name) + '</option>'; }).join('');
      sel.innerHTML = '<option value="">' + t('common.selectList') + '</option>' + opts;
    }
    var c = document.getElementById('exceptions-list');
    var all = [];
    state.blockLists.forEach(function(l) {
      l.exceptions.forEach(function(e) {
        var val = '';
        if (e.exception_type.Domain !== undefined) val = e.exception_type.Domain;
        else if (e.exception_type.Wildcard !== undefined) val = e.exception_type.Wildcard;
        else if (e.exception_type === 'LocalFiles') val = 'file://*';
        all.push({ id: e.id, value: val, listName: l.name, listId: l.id });
      });
    });
    if (all.length === 0) { c.innerHTML = '<div class="empty-state">' + t('websites.noExceptions') + '</div>'; return; }
    c.innerHTML = all.map(function(r) {
      return '<div class="rule-item"><div class="rule-info"><span class="rule-type-badge" style="background:var(--success-dim);color:var(--success);">' + t('common.allowed') + '</span><span class="rule-value">' + esc(r.value) + '</span><span class="rule-list-name">' + esc(r.listName) + '</span></div>' +
        '<button class="btn-icon" data-action="remove-exception" data-list-id="' + r.listId + '" data-exc-id="' + r.id + '">' + ico('x', 14) + '</button></div>';
    }).join('');
    refreshIcons();
  },

  async addException() {
    var lid = document.getElementById('exception-list-select').value;
    var v = document.getElementById('exception-input').value.trim();
    if (!lid) { toast(t('toast.selectListFirst'), 'error'); return; }
    if (!v) { toast(t('toast.enterDomain'), 'error'); return; }
    try {
      await invoke('add_exception', { listId: lid, domain: v, exceptionType: 'domain' });
      document.getElementById('exception-input').value = '';
      toast(t('toast.exceptionAdded', { domain: v }), 'success');
      await this.refreshBlockLists();
      this.refreshExceptions();
    } catch (e) { toast(t('common.failed', { error: e }), 'error'); }
  },

  async removeException(lid, eid) {
    try {
      await invoke('remove_exception', { listId: lid, exceptionId: eid });
      toast(t('toast.removed'), 'success');
      await this.refreshBlockLists();
      this.refreshExceptions();
    } catch (e) { toast(t('common.failed', { error: e }), 'error'); }
  },

  // ── Import ──────────────────────────────────────────────────
  async importFromText() {
    var lid = document.getElementById('website-list-select').value;
    if (!lid) { toast(t('toast.selectListFirst'), 'error'); return; }

    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.csv,.json';
    input.onchange = async function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var text = await file.text();
      var domains = [];

      if (file.name.endsWith('.json')) {
        try {
          var data = JSON.parse(text);
          if (Array.isArray(data)) domains = data;
          else if (data.domains) domains = data.domains;
        } catch (err) { toast(t('toast.invalidJson'), 'error'); return; }
      } else {
        domains = text.split(/[\r\n,;]+/).map(function(s) { return s.trim(); }).filter(function(s) { return s && !s.startsWith('#'); });
      }

      if (domains.length === 0) { toast(t('toast.noDomainsFound'), 'error'); return; }
      try {
        var result = await invoke('bulk_import_websites', { listId: lid, domains: domains, ruleType: 'domain' });
        toast(t('toast.imported', { count: result.added, item: 'domains' }), 'success');
        await ui.refreshBlockLists();
        ui.refreshWebsites();
      } catch (err) { toast(t('toast.importFailed', { error: err }), 'error'); }
    };
    input.click();
  },

  async importPremadeList(category) {
    var lid = document.getElementById('website-list-select').value;
    if (!lid) { toast(t('toast.selectListFirst'), 'error'); return; }

    try {
      var resp = await fetch('premade-lists.json');
      var data = await resp.json();
      var cat = data.categories[category];
      if (!cat) { toast(t('toast.importFailed', { error: 'Category not found' }), 'error'); return; }

      var totalAdded = 0;

      // Import domains
      if (cat.domains && cat.domains.length > 0) {
        var result = await invoke('bulk_import_websites', { listId: lid, domains: cat.domains, ruleType: 'domain' });
        totalAdded += result.added;
      }

      // Import wildcards
      if (cat.wildcards && cat.wildcards.length > 0) {
        var wResult = await invoke('bulk_import_websites', { listId: lid, domains: cat.wildcards, ruleType: 'wildcard' });
        totalAdded += wResult.added;
      }

      if (totalAdded === 0) {
        toast(t('toast.allItemsAlreadyInList', { name: cat.name }), 'info');
      } else {
        toast(t('toast.importedCategory', { count: totalAdded, name: cat.name }), 'success');
      }
      await this.refreshBlockLists();
      this.refreshWebsites();
    } catch (e) { toast(t('common.failed', { error: e }), 'error'); }
  },

  async importEntireInternet() {
    var lid = document.getElementById('website-list-select').value;
    if (!lid) { toast(t('toast.selectListFirst'), 'error'); return; }
    var ok = await showConfirm(t('confirm.blockEntireInternet'), t('confirm.blockEntireInternetMsg'));
    if (!ok) return;
    try {
      await invoke('add_website_rule', { listId: lid, ruleType: 'entire_internet', value: '*' });
      toast(t('toast.entireInternetBlocked'), 'success');
      await this.refreshBlockLists();
      this.refreshWebsites();
    } catch (e) { toast(t('common.failed', { error: e }), 'error'); }
  },

  importKeywordPrompt: function() {
    var lid = document.getElementById('website-list-select').value;
    if (!lid) { toast(t('toast.selectListFirst'), 'error'); return; }

    document.getElementById('modal-title').textContent = t('modal.blockUrlsContaining');
    document.getElementById('modal-body').innerHTML =
      '<label style="display:block;margin-bottom:4px;font-size:12px;color:var(--text-muted);">' + t('common.keyword') + '</label>' +
      '<input type="text" id="modal-keyword-input" class="input" style="width:100%;" placeholder="' + t('modal.keywordPlaceholder') + '">' +
      '<p style="font-size:12px;color:var(--text-muted);margin-top:8px;">' + t('modal.keywordHint') + '</p>';
    document.getElementById('modal-confirm').textContent = t('modal.block');
    document.getElementById('modal-confirm').setAttribute('data-action', 'confirm-keyword');
    document.getElementById('modal-confirm').setAttribute('data-list-id', lid);
    document.getElementById('modal-overlay').classList.remove('hidden');
    setTimeout(function() { var i = document.getElementById('modal-keyword-input'); if (i) i.focus(); }, 80);
  },

  async confirmKeyword(lid) {
    var i = document.getElementById('modal-keyword-input');
    var kw = i ? i.value.trim() : '';
    if (!kw) { toast(t('toast.enterKeyword'), 'error'); return; }
    try {
      await invoke('add_website_rule', { listId: lid, ruleType: 'keyword', value: kw });
      toast(t('toast.keywordBlocked', { kw: kw }), 'success');
      this.closeModal();
      await this.refreshBlockLists();
      this.refreshWebsites();
    } catch (e) { toast(t('common.failed', { error: e }), 'error'); }
  },

  async clearAllWebsites() {
    var ok = await showConfirm(t('confirm.clearAllWebsites'), t('confirm.clearAllWebsitesMsg'));
    if (!ok) return;
    try {
      var result = await invoke('clear_all_websites');
      toast(t('toast.cleared', { count: result.cleared, item: 'websites' }), 'success');
      await this.refreshBlockLists();
      this.refreshWebsites();
    } catch (e) { toast(t('common.failed', { error: e }), 'error'); }
  },

  async clearAllApps() {
    var ok = await showConfirm(t('confirm.clearAllApps'), t('confirm.clearAllAppsMsg'));
    if (!ok) return;
    try {
      var result = await invoke('clear_all_apps');
      toast(t('toast.cleared', { count: result.cleared, item: 'apps' }), 'success');
      await this.refreshBlockLists();
      this.refreshApps();
    } catch (e) { toast(t('common.failed', { error: e }), 'error'); }
  },

  toggleImportDropdown: function() {
    var dd = document.getElementById('import-dropdown');
    dd.classList.toggle('hidden');
  },

  async loadPremadeLists() {
    try {
      var resp = await fetch('premade-lists.json');
      var data = await resp.json();
      var container = document.getElementById('premade-list-items');
      if (!container) return;
      var html = '';
      Object.keys(data.categories).forEach(function(key) {
        var cat = data.categories[key];
        html += '<button class="dropdown-item" data-action="import-premade" data-category="' + key + '">' + esc(cat.name) + '</button>';
      });
      container.innerHTML = html;
    } catch (e) {}
  },

  // ─── Settings Actions ─────────────────────────────────────────

  async exportConfiguration() {
    try {
      var path = await invoke('export_configuration');
      if (!path) return; // user cancelled the dialog
      toast(t('toast.exportedTo', { path: path }), 'success');
    } catch (e) {
      toast(t('toast.exportFailed', { error: e }), 'error');
    }
  },

  async importConfiguration() {
    var text;
    try {
      text = await invoke('pick_import_file');
    } catch (err) {
      toast(t('toast.importFailed', { error: err }), 'error');
      return;
    }
    if (!text) return; // user cancelled

    // Validate JSON before showing warning
    try { JSON.parse(text); }
    catch (err) { toast(t('toast.invalidJson'), 'error'); return; }

    var ok = await showConfirm(
      t('confirm.importConfig'),
      t('confirm.importConfigMsg')
    );
    if (!ok) return;

    try {
      var result = await invoke('import_configuration', { json: text });
      toast(t('toast.importedLists', { count: (result.imported || 0) }), 'success');
      await this.refreshBlockLists();
      if (state.currentPage === 'dashboard') this.refreshDashboard();
    } catch (err) {
      toast(t('toast.importFailed', { error: err }), 'error');
    }
  },

  async clearStatistics() {
    var ok = await showConfirm(
      t('confirm.clearStatistics'),
      t('confirm.clearStatisticsMsg')
    );
    if (!ok) return;
    try {
      await invoke('clear_statistics');
      toast(t('toast.cleared', { count: 'statistics', item: '' }), 'success');
      if (state.currentPage === 'statistics') ui.refreshStatistics();
      if (state.currentPage === 'dashboard') ui.refreshDashboard();
    } catch (e) {
      toast(t('common.failed', { error: e }), 'error');
    }
  },

  async applyRetention() {
    var input = document.getElementById('setting-retention-input');
    if (!input) return;
    var days = parseInt(input.value, 10);
    if (!days || days < 1) {
      toast(t('toast.invalidRetention'), 'error');
      return;
    }
    if (days > 36500) {
      toast(t('toast.maxRetention'), 'error');
      return;
    }
    try {
      var deleted = await invoke('set_stats_retention', { days: days });
      if (deleted > 0) {
        toast(t('toast.retentionSetWithCleanup', { days: days, deleted: deleted }), 'success');
      } else {
        toast(t('toast.retentionSet', { days: days }), 'success');
      }
      if (state.currentPage === 'statistics') ui.refreshStatistics();
      if (state.currentPage === 'dashboard') ui.refreshDashboard();
    } catch (e) {
      toast(t('common.failed', { error: e }), 'error');
    }
  },

  async resetSettings() {
    var ok = await showConfirm(
      t('confirm.resetSettings'),
      t('confirm.resetSettingsMsg')
    );
    if (!ok) return;
    try {
      await invoke('reset_settings');
      toast(t('toast.settingsReset'), 'success');
    } catch (e) {
      toast(t('common.failed', { error: e }), 'error');
    }
  },

  async deleteAllData() {
    var ok = await showConfirm(
      t('confirm.deleteAllData'),
      t('confirm.deleteAllDataMsg')
    );
    if (!ok) return;
    // Double confirmation for this destructive action
    var ok2 = await showConfirm(
      t('confirm.areYouSure'),
      t('confirm.deleteAllDataMsg2')
    );
    if (!ok2) return;
    try {
      await invoke('delete_all_data');
      toast(t('toast.allDataDeleted'), 'success');
      await ui.refreshBlockLists();
      ui.navigateTo('dashboard');
    } catch (e) {
      toast(t('common.failed', { error: e }), 'error');
    }
  },

  // ─── Pomodoro + Allowance ─────────────────────────────────────
  _pomodoroStatus: null,
  _pomodoroPollTimer: null,
  _pomodoroEventTimer: null,
  _pomodoroPreset: 'classic',
  _pomodoroLastPhase: null,

  _fmtTime: function(secs) {
    secs = Math.max(0, secs | 0);
    var m = Math.floor(secs / 60);
    var s = secs % 60;
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
  },

  _fmtMinutes: function(secs) {
    secs = Math.max(0, secs | 0);
    var m = Math.floor(secs / 60);
    return m + 'm';
  },

  _renderPomodoroWidget: async function() {
    var body = document.getElementById('pomodoro-body');
    var hint = document.getElementById('pomodoro-header-hint');
    if (!body) return;
    try {
      var status = await invoke('pomodoro_get_status');
      ui._pomodoroStatus = status;
      if (!status) {
        body.innerHTML = '<div class="pomodoro-idle">' +
          '<p class="pomodoro-idle-text">' + t('dashboard.startFocusDesc') + '</p>' +
          '<button class="btn btn-primary" id="btn-start-pomodoro"><i data-lucide="play"></i> ' + t('dashboard.startFocusSession') + '</button>' +
          '</div>';
        if (hint) hint.textContent = t('status.pomodoro');
        var b = document.getElementById('btn-start-pomodoro');
        if (b) b.addEventListener('click', function() { ui.openPomodoroStartModal(); });
        refreshIcons();
        return;
      }

      var phase = status.current_phase; // "work" | "short_break" | "long_break"
      var isWork = phase === 'work';
      var phaseLabel = isWork ? t('pomodoro.work') : (phase === 'long_break' ? t('pomodoro.longBreak') : t('pomodoro.shortBreak'));
      var remaining = status.remaining_secs;
      var totalDur = status.phase_duration_secs || 1;
      var pct = 1 - (remaining / totalDur);
      if (pct < 0) pct = 0; if (pct > 1) pct = 1;

      // Ring math: circumference = 2πr where r = 54 (size=120, stroke=8 → r=54)
      var radius = 54;
      var circumference = 2 * Math.PI * radius;
      var dashOffset = circumference * (1 - pct);

      var ringClass = isWork ? 'phase-work' : 'phase-break';
      var cycleText = t('pomodoro.cycle', { current: status.current_cycle, completed: status.completed_cycles });

      body.innerHTML =
        '<div class="pomodoro-active">' +
          '<div class="pomodoro-ring ' + ringClass + '">' +
            '<svg viewBox="0 0 120 120">' +
              '<circle class="pomodoro-ring-bg" cx="60" cy="60" r="' + radius + '" stroke-width="8"></circle>' +
              '<circle class="pomodoro-ring-fill" cx="60" cy="60" r="' + radius + '" stroke-width="8" ' +
                'stroke-dasharray="' + circumference + '" stroke-dashoffset="' + dashOffset + '"></circle>' +
            '</svg>' +
            '<div class="pomodoro-ring-center">' +
              '<div class="pomodoro-time">' + ui._fmtTime(remaining) + '</div>' +
              '<div class="pomodoro-cycle-badge">' + (status.paused ? t('status.paused') : phaseLabel) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="pomodoro-info">' +
            '<h4 class="pomodoro-phase-label">' + phaseLabel + (status.paused ? t('pomodoro.pausedSuffix') : '') + '</h4>' +
            '<div class="pomodoro-meta">' + escapeHtml(status.block_list_name) + '</div>' +
            '<div class="pomodoro-meta">' + cycleText + '</div>' +
            '<div class="pomodoro-controls">' +
              (status.paused
                ? '<button class="btn btn-primary" id="btn-pom-resume"><i data-lucide="play"></i> ' + t('pomodoro.resume') + '</button>'
                : '<button class="btn btn-secondary" id="btn-pom-pause"><i data-lucide="pause"></i> ' + t('pomodoro.pause') + '</button>') +
              '<button class="btn btn-secondary" id="btn-pom-skip"><i data-lucide="skip-forward"></i> ' + t('pomodoro.skip') + '</button>' +
              '<button class="btn btn-danger" id="btn-pom-stop"><i data-lucide="square"></i> ' + t('pomodoro.stop') + '</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      if (hint) hint.textContent = isWork ? t('status.focusMode') : t('status.breakTime');

      var bp = document.getElementById('btn-pom-pause');
      if (bp) bp.addEventListener('click', function() { ui.pomodoroPause(); });
      var br = document.getElementById('btn-pom-resume');
      if (br) br.addEventListener('click', function() { ui.pomodoroResume(); });
      var bs = document.getElementById('btn-pom-skip');
      if (bs) bs.addEventListener('click', function() { ui.pomodoroSkip(); });
      var bq = document.getElementById('btn-pom-stop');
      if (bq) bq.addEventListener('click', function() { ui.pomodoroStop(); });
      refreshIcons();
    } catch (e) {
      body.innerHTML = '<div class="empty-state">' + t('dashboard.focusSessionUnavailable') + '</div>';
    }
  },

  startPomodoroPolling: function() {
    if (ui._pomodoroPollTimer) return;
    ui._pomodoroPollTimer = setInterval(function() {
      if (state.currentPage !== 'dashboard') return;
      ui._renderPomodoroWidget();
    }, 1000);
  },

  _pomodoroNotifEnabled: true,

  startPomodoroEventPolling: function() {
    if (ui._pomodoroEventTimer) return;
    ui._pomodoroEventTimer = setInterval(function() {
      invoke('pomodoro_drain_events').then(function(events) {
        if (!events || !events.length) return;
        events.forEach(function(ev) {
          if (ev.kind === 'phase_advanced') {
            if (!ui._pomodoroNotifEnabled) return;
            var label = ev.to === 'work' ? t('pomodoro.workStarted') :
                        ev.to === 'long_break' ? t('pomodoro.longBreakStarted') :
                        t('pomodoro.breakStarted');
            toast(label, 'success');
          } else if (ev.kind === 'tamper_detected') {
            toast(t('pomodoro.tamperDetected'), 'error');
          }
        });
        ui._renderPomodoroWidget();
      }).catch(function() {});
    }, 2000);
  },

  _pomodoroPresets: {
    classic: { name: function() { return t('pomodoro.classicName'); }, work: 25, short: 5, long: 15, cycles: 4, desc: function() { return t('pomodoro.classicDesc'); } },
    long:    { name: function() { return t('pomodoro.longName'); },    work: 50, short: 10, long: 30, cycles: 3, desc: function() { return t('pomodoro.longDesc'); } },
    sprint:  { name: function() { return t('pomodoro.sprintName'); },  work: 15, short: 3,  long: 10, cycles: 4, desc: function() { return t('pomodoro.sprintDesc'); } },
  },

  openPomodoroStartModal: async function() {
    var lists = [];
    try { lists = await invoke('list_block_lists'); } catch (e) {}
    if (!lists || lists.length === 0) {
      toast(t('toast.createBlockListFirst'), 'warning');
      return;
    }

    var old = document.getElementById('pomodoro-modal-overlay');
    if (old) old.remove();

    var overlay = document.createElement('div');
    overlay.id = 'pomodoro-modal-overlay';
    overlay.className = 'pomodoro-modal-overlay';

    var listMeta = function(l) {
      var extra = [];
      if (l.websites && l.websites.length) extra.push(l.websites.length + ' ' + t('common.site') + (l.websites.length === 1 ? '' : 's'));
      if (l.applications && l.applications.length) extra.push(l.applications.length + ' ' + t('common.app') + (l.applications.length === 1 ? '' : 's'));
      return extra.length ? extra.join(' · ') : t('modal.emptyList');
    };
    var optionsHtml = lists.map(function(l, i) {
      return '<button type="button" class="pomo-dropdown-option' + (i === 0 ? ' selected' : '') + '" data-list-id="' + l.id + '" data-list-name="' + escapeHtml(l.name) + '" data-list-meta="' + escapeHtml(listMeta(l)) + '">' +
        '<span class="pomo-dd-option-main">' + escapeHtml(l.name) + '</span>' +
        '<span class="pomo-dd-option-meta">' + escapeHtml(listMeta(l)) + '</span>' +
        '<svg class="pomo-dd-check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
      '</button>';
    }).join('');
    var firstList = lists[0];

    var presetCardHtml = function(key, recommended) {
      var p = ui._pomodoroPresets[key];
      var rec = recommended ? '<span class="pomo-recommended">' + t('modal.recommended') + '</span>' : '';
      return '<button class="pomo-preset-card-v2" data-preset="' + key + '">' +
        rec +
        '<div class="pomo-preset-name">' + p.name() + '</div>' +
        '<div class="pomo-preset-ratio">' + p.work + '<span class="slash">/</span>' + p.short + '</div>' +
        '<div class="pomo-preset-desc">' + p.desc() + '</div>' +
      '</button>';
    };

    overlay.innerHTML =
      '<div class="pomodoro-modal v2">' +
        '<div class="pomo-modal-head">' +
          '<h3>' +
            '<span class="pomo-icon-ring"><i data-lucide="timer"></i></span>' +
            t('modal.startFocusSession') +
          '</h3>' +
          '<p>' + t('modal.pomodoroDescription') + '</p>' +
        '</div>' +

        '<div class="pomo-modal-body">' +
          '<div class="pomo-section">' +
            '<div class="pomo-section-label">' + t('modal.whichBlocksApply') + '</div>' +
            '<div class="pomo-dropdown" id="pomo-list-dropdown" data-value="' + firstList.id + '">' +
              '<button type="button" class="pomo-dropdown-trigger" id="pomo-list-trigger">' +
                '<span class="pomo-dd-main" id="pomo-list-main">' + escapeHtml(firstList.name) + '</span>' +
                '<span class="pomo-dd-meta" id="pomo-list-meta">' + escapeHtml(listMeta(firstList)) + '</span>' +
                '<svg class="pomo-dd-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' +
              '</button>' +
              '<div class="pomo-dropdown-panel" id="pomo-list-panel" style="display:none;">' + optionsHtml + '</div>' +
            '</div>' +
          '</div>' +

          '<div class="pomo-section">' +
            '<div class="pomo-section-label">' + t('modal.pickRhythm') + '</div>' +
            '<div class="pomo-preset-grid">' +
              presetCardHtml('classic', true) +
              presetCardHtml('long', false) +
              presetCardHtml('sprint', false) +
            '</div>' +
            '<button class="pomo-custom-card" data-preset="custom">' +
              '<span class="pomo-custom-left"><i data-lucide="sliders-horizontal"></i> ' + t('modal.customRhythm') + '</span>' +
              '<i data-lucide="chevron-down" class="pomo-custom-chevron"></i>' +
            '</button>' +
            '<div class="pomo-custom-body" id="pomo-custom-body">' +
              '<div class="pomo-custom-grid">' +
                '<div class="pomo-field">' +
                  '<label>' + t('modal.workMinutes') + '</label>' +
                  '<input type="number" id="pomo-work" min="1" max="480" value="25">' +
                  '<span class="pomo-field-hint">' + t('modal.workHint') + '</span>' +
                '</div>' +
                '<div class="pomo-field">' +
                  '<label>' + t('modal.shortBreakMinutes') + '</label>' +
                  '<input type="number" id="pomo-short" min="1" max="120" value="5">' +
                  '<span class="pomo-field-hint">' + t('modal.shortBreakHint') + '</span>' +
                '</div>' +
                '<div class="pomo-field">' +
                  '<label>' + t('modal.longBreakMinutes') + '</label>' +
                  '<input type="number" id="pomo-long" min="1" max="120" value="15">' +
                  '<span class="pomo-field-hint">' + t('modal.longBreakHint') + '</span>' +
                '</div>' +
                '<div class="pomo-field">' +
                  '<label>' + t('modal.workCyclesPerSet') + '</label>' +
                  '<input type="number" id="pomo-cycles" min="1" max="20" value="4">' +
                  '<span class="pomo-field-hint">' + t('modal.cyclesHint') + '</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="pomo-section">' +
            '<div class="pomo-preview">' +
              '<div class="pomo-preview-header">' +
                '<div class="pomo-preview-title">' + t('modal.sessionRhythm') + '</div>' +
                '<div class="pomo-preview-total" id="pomo-preview-total">—</div>' +
              '</div>' +
              '<div class="pomo-preview-strip" id="pomo-preview-strip"></div>' +
              '<div class="pomo-preview-legend">' +
                '<div class="pomo-preview-legend-item"><span class="pomo-preview-legend-dot work"></span> ' + t('modal.work') + '</div>' +
                '<div class="pomo-preview-legend-item"><span class="pomo-preview-legend-dot short"></span> ' + t('modal.shortBreak') + '</div>' +
                '<div class="pomo-preview-legend-item"><span class="pomo-preview-legend-dot long"></span> ' + t('modal.longBreak') + '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="pomo-section">' +
            '<div class="pomo-summary" id="pomo-summary">' +
              '<i data-lucide="sparkles"></i><span id="pomo-summary-text">—</span>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="pomo-modal-footer">' +
          '<button class="btn btn-secondary" id="pomo-cancel">' + t('common.cancel') + '</button>' +
          '<button class="btn btn-primary" id="pomo-start"><i data-lucide="play"></i> ' + t('modal.startSession') + '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    // Wire the custom dropdown
    var ddRoot = document.getElementById('pomo-list-dropdown');
    var ddTrigger = document.getElementById('pomo-list-trigger');
    var ddPanel = document.getElementById('pomo-list-panel');
    var ddMain = document.getElementById('pomo-list-main');
    var ddMeta = document.getElementById('pomo-list-meta');

    function closeDropdown() {
      ddPanel.style.display = 'none';
      ddTrigger.classList.remove('open');
    }
    function openDropdown() {
      ddPanel.style.display = 'block';
      ddTrigger.classList.add('open');
    }
    ddTrigger.addEventListener('click', function(e) {
      e.stopPropagation();
      if (ddTrigger.classList.contains('open')) closeDropdown();
      else openDropdown();
    });
    ddPanel.querySelectorAll('.pomo-dropdown-option').forEach(function(opt) {
      opt.addEventListener('click', function(e) {
        e.stopPropagation();
        ddPanel.querySelectorAll('.pomo-dropdown-option').forEach(function(o) {
          o.classList.remove('selected');
        });
        opt.classList.add('selected');
        ddRoot.setAttribute('data-value', opt.getAttribute('data-list-id'));
        ddMain.textContent = opt.getAttribute('data-list-name');
        ddMeta.textContent = opt.getAttribute('data-list-meta');
        closeDropdown();
      });
    });
    // Close when clicking anywhere else
    overlay.addEventListener('click', function(e) {
      if (!ddRoot.contains(e.target)) closeDropdown();
    });

    // Mark default preset active (Classic — or whichever is in settings)
    var initialPreset = ui._pomodoroPreset && ui._pomodoroPresets[ui._pomodoroPreset]
      ? ui._pomodoroPreset
      : 'classic';
    ui._pomodoroPreset = initialPreset;
    var presetCards = overlay.querySelectorAll('.pomo-preset-card-v2');
    var customCard = overlay.querySelector('.pomo-custom-card');
    var customBody = overlay.querySelector('#pomo-custom-body');

    function setActivePreset(key) {
      ui._pomodoroPreset = key;
      presetCards.forEach(function(c) {
        c.classList.toggle('active', c.getAttribute('data-preset') === key);
      });
      if (key === 'custom') {
        customCard.classList.add('active');
        customBody.classList.add('open');
      } else {
        customCard.classList.remove('active');
        customBody.classList.remove('open');
        // Sync custom inputs to the preset so custom starts from current values
        var p = ui._pomodoroPresets[key];
        if (p) {
          document.getElementById('pomo-work').value = p.work;
          document.getElementById('pomo-short').value = p.short;
          document.getElementById('pomo-long').value = p.long;
          document.getElementById('pomo-cycles').value = p.cycles;
        }
      }
      ui._updatePomodoroPreview();
    }

    presetCards.forEach(function(card) {
      card.addEventListener('click', function() {
        setActivePreset(card.getAttribute('data-preset'));
      });
    });
    customCard.addEventListener('click', function() {
      setActivePreset(customCard.classList.contains('active') ? initialPreset : 'custom');
    });

    ['pomo-work', 'pomo-short', 'pomo-long', 'pomo-cycles'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', function() {
        // Editing custom fields implicitly selects Custom
        if (!customCard.classList.contains('active')) setActivePreset('custom');
        else ui._updatePomodoroPreview();
      });
    });

    setActivePreset(initialPreset);
    refreshIcons();

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });
    document.getElementById('pomo-cancel').addEventListener('click', function() { overlay.remove(); });
    document.getElementById('pomo-start').addEventListener('click', async function() {
      var listId = ddRoot.getAttribute('data-value');
      var config = ui._pomodoroResolveFromInputs();
      try {
        await invoke('pomodoro_start', {
          blockListId: listId,
          workSecs: config.work,
          shortBreakSecs: config.short,
          longBreakSecs: config.long,
          cyclesUntilLongBreak: config.cycles,
        });
        overlay.remove();
        toast(t('toast.focusSessionStarted'), 'success');
        ui._renderPomodoroWidget();
      } catch (e) {
        toast(t('toast.startFailed', { error: e }), 'error');
      }
    });
  },

  _updatePomodoroPreview: function() {
    var cfg = ui._pomodoroResolveFromInputs();
    var strip = document.getElementById('pomo-preview-strip');
    var total = document.getElementById('pomo-preview-total');
    var summary = document.getElementById('pomo-summary-text');
    if (!strip || !cfg) return;

    var cycles = cfg.cycles;
    var workMin = Math.round(cfg.work / 60);
    var shortMin = Math.round(cfg.short / 60);
    var longMin = Math.round(cfg.long / 60);

    // Build segments: cycles × (work + short), with the last short replaced by long
    var segs = [];
    for (var i = 1; i <= cycles; i++) {
      segs.push({ kind: 'work', mins: workMin });
      if (i < cycles) segs.push({ kind: 'short', mins: shortMin });
      else segs.push({ kind: 'long', mins: longMin });
    }

    // Compute widths proportional to minutes
    var totalMins = segs.reduce(function(s, x) { return s + x.mins; }, 0);
    strip.innerHTML = segs.map(function(seg) {
      var pct = Math.max(3, (seg.mins / totalMins) * 100);
      var label = seg.mins >= 5 ? seg.mins + 'm' : '';
      var segTitle = seg.kind === 'work' ? t('modal.work') : seg.kind === 'short' ? t('modal.shortBreak') : t('modal.longBreak');
      return '<div class="pomo-preview-seg ' + seg.kind + '" style="flex:' + seg.mins + ' 0 0;min-width:0;" title="' +
        segTitle + ' — ' + seg.mins + ' ' + t('statistics.minutes', { n: '' }).trim() + '">' + label + '</div>';
    }).join('');

    var hours = Math.floor(totalMins / 60);
    var mins = totalMins % 60;
    var totalStr = (hours > 0 ? hours + 'h ' : '') + mins + 'm';
    total.innerHTML = t('modal.roundTrip', { time: totalStr });

    if (summary) {
      summary.innerHTML = t('modal.summaryPattern', {
        cycles: cycles, work: workMin, short: shortMin, long: longMin
      });
    }
  },

  _pomodoroResolveFromInputs: function() {
    var preset = ui._pomodoroPreset;
    if (preset && ui._pomodoroPresets[preset]) {
      var p = ui._pomodoroPresets[preset];
      return {
        work: p.work * 60, short: p.short * 60, long: p.long * 60, cycles: p.cycles,
      };
    }
    // custom
    return {
      work: Math.max(60, parseInt(document.getElementById('pomo-work').value || '25', 10) * 60),
      short: Math.max(30, parseInt(document.getElementById('pomo-short').value || '5', 10) * 60),
      long: Math.max(30, parseInt(document.getElementById('pomo-long').value || '15', 10) * 60),
      cycles: Math.max(1, parseInt(document.getElementById('pomo-cycles').value || '4', 10)),
    };
  },

  pomodoroPause: async function() {
    try { await invoke('pomodoro_pause'); ui._renderPomodoroWidget(); }
    catch (e) { toast(t('toast.pauseFailed', { error: e }), 'error'); }
  },

  pomodoroResume: async function() {
    try { await invoke('pomodoro_resume'); ui._renderPomodoroWidget(); }
    catch (e) { toast(t('toast.resumeFailed', { error: e }), 'error'); }
  },

  pomodoroSkip: async function() {
    try { await invoke('pomodoro_skip'); ui._renderPomodoroWidget(); }
    catch (e) { toast(t('toast.skipFailed', { error: e }), 'error'); }
  },

  pomodoroStop: async function() {
    if (!confirm(t('confirm.endFocusSession'))) return;
    try {
      await invoke('pomodoro_stop');
      toast(t('toast.focusSessionEnded'), 'success');
      ui._renderPomodoroWidget();
    } catch (e) { toast(t('toast.stopFailed', { error: e }), 'error'); }
  },

  _renderAllowanceDashboard: async function() {
    var container = document.getElementById('dashboard-allowances');
    if (!container) return;
    try {
      var list = await invoke('allowance_list');
      if (!list || list.length === 0) {
        container.innerHTML = '<div class="empty-state">' + t('dashboard.noAllowances') + '</div>';
        return;
      }
      container.innerHTML = list.slice(0, 6).map(ui._renderAllowanceRow).join('');
      refreshIcons();
    } catch (e) {
      container.innerHTML = '<div class="empty-state">' + t('common.unableToLoad') + '</div>';
    }
  },

  _renderAllowanceRow: function(item) {
    var a = item.allowance;
    var used = item.used_today_secs;
    var limit = a.daily_limit_secs;
    var pct = Math.min(100, (used / limit) * 100);
    var fillClass = item.exhausted ? 'exhausted' : (pct >= 80 ? 'warn' : '');
    var kind = String(a.target.kind || '').toLowerCase();
    var kindLabel = kind === 'domain' ? t('allowance.domainKind') : t('allowance.appKind');
    var target = a.target.value;
    var exhaustedCls = item.exhausted ? 'exhausted' : '';

    return '<div class="allowance-row ' + exhaustedCls + '" data-allowance-id="' + a.id + '">' +
      '<div class="allowance-target">' +
        '<div class="allowance-target-name">' + escapeHtml(target) + '</div>' +
        '<div class="allowance-target-kind">' + kindLabel + (a.enabled ? '' : t('allowance.disabledSuffix')) + '</div>' +
      '</div>' +
      '<div class="allowance-progress-wrap">' +
        '<div class="allowance-progress-bar">' +
          '<div class="allowance-progress-fill ' + fillClass + '" style="width:' + pct + '%;"></div>' +
        '</div>' +
        '<div class="allowance-meta">' + ui._fmtMinutes(used) + ' / ' + ui._fmtMinutes(limit) +
          (item.exhausted ? ' · ' + t('allowance.exhaustedBlocked') : ' · ' + ui._fmtMinutes(item.remaining_secs) + ' ' + t('status.left')) +
        '</div>' +
      '</div>' +
      '<div class="allowance-row-actions">' +
        '<button data-action="reset-allowance" data-id="' + a.id + '" title="' + t('allowance.resetToday') + '"><i data-lucide="rotate-ccw"></i></button>' +
        '<button data-action="delete-allowance" data-id="' + a.id + '" class="danger" title="' + t('common.delete') + '"><i data-lucide="trash-2"></i></button>' +
      '</div>' +
    '</div>';
  },

  refreshAllowancesTab: async function() {
    var container = document.getElementById('allowances-list');
    if (!container) return;
    try {
      var list = await invoke('allowance_list');
      if (!list || list.length === 0) {
        container.innerHTML = '<div class="empty-state">' + t('allowance.noAllowancesYet') + '</div>';
        return;
      }
      container.innerHTML = list.map(ui._renderAllowanceRow).join('');
      refreshIcons();
    } catch (e) {
      container.innerHTML = '<div class="empty-state">' + t('common.unableToLoad') + '</div>';
    }
  },

  addAllowance: async function() {
    var kind = document.getElementById('allowance-kind-select').value;
    var value = (document.getElementById('allowance-value-input').value || '').trim();
    var minutes = parseInt(document.getElementById('allowance-minutes-input').value || '30', 10);
    var strict = document.getElementById('allowance-strict-input').checked;
    if (!value) { toast(t('toast.enterDomain'), 'warning'); return; }
    if (!minutes || minutes < 1) { toast(t('toast.enterMinutes'), 'warning'); return; }
    try {
      await invoke('allowance_create', {
        kind: kind, value: value,
        dailyLimitSecs: minutes * 60,
        strictMode: strict,
      });
      document.getElementById('allowance-value-input').value = '';
      document.getElementById('allowance-minutes-input').value = '30';
      toast(t('toast.allowanceAdded'), 'success');
      ui.refreshAllowancesTab();
      ui._renderAllowanceDashboard();
    } catch (e) {
      toast(t('common.failed', { error: e }), 'error');
    }
  },

  deleteAllowance: async function(id) {
    if (!confirm(t('confirm.deleteAllowance'))) return;
    try {
      await invoke('allowance_delete', { id: id });
      toast(t('toast.deleted'), 'success');
      ui.refreshAllowancesTab();
      ui._renderAllowanceDashboard();
    } catch (e) { toast(t('common.failed', { error: e }), 'error'); }
  },

  resetAllowance: async function(id) {
    try {
      await invoke('allowance_reset_today', { id: id });
      toast(t('allowance.todayReset'), 'success');
      ui.refreshAllowancesTab();
      ui._renderAllowanceDashboard();
    } catch (e) { toast(t('common.failed', { error: e }), 'error'); }
  },

  startAllowanceNotificationPolling: function() {
    // Drain notifications every 3s
    setInterval(function() {
      invoke('allowance_drain_notifications').then(function(events) {
        if (!events || !events.length) return;
        events.forEach(function(n) {
          if (n.kind === 'Warning80') {
            toast(t('allowance.warning80', { target: n.target, used: Math.round(n.used_secs / 60) }), 'warning');
          } else if (n.kind === 'Exhausted') {
            toast(t('allowance.exhaustedNotification', { target: n.target }), 'error');
          }
        });
      }).catch(function() {});
    }, 3000);

    // Continuously refresh whichever allowance view is visible so the
    // user sees usage tick up in real time.
    setInterval(function() {
      var tab = document.getElementById('websites-tab-allowances');
      var onAllowancesTab = tab && tab.classList.contains('active');
      if (state.currentPage === 'websites' && onAllowancesTab) {
        ui.refreshAllowancesTab();
      } else if (state.currentPage === 'dashboard') {
        ui._renderAllowanceDashboard();
      } else if (state.currentPage === 'statistics') {
        ui._renderAllowanceSummary();
      }
    }, 5000);
  },

  // ─── Updater ───────────────────────────────────────────────────
  _updateAvailable: false,
  _updating: false,

  handleSettingsUpdateBtn: function() {
    if (ui._updating) return;
    if (ui._updateAvailable) {
      ui._doUpdate();
      return;
    }
    // Always re-check when clicked
    var btn = document.getElementById('btn-check-update');
    var desc = document.getElementById('update-status-text');
    if (btn) btn.textContent = t('settings.checking');
    if (desc) desc.textContent = t('settings.checking') + '...';
    invoke('check_for_update').then(function(result) {
      if (result && result.available) {
        ui._updateAvailable = true;
        if (desc) desc.textContent = t('settings.updateAvailable', { version: result.version });
        if (btn) btn.textContent = t('settings.downloadInstall');
        var b = document.getElementById('update-banner');
        var bt = document.getElementById('update-banner-text');
        if (b) b.style.display = 'block';
        if (bt) bt.textContent = t('updater.updateAvailableBanner', { version: result.version });
        toast(t('toast.newVersionAvailable', { version: result.version }), 'success');
      } else {
        if (desc) desc.textContent = t('settings.latestVersion');
        if (btn) btn.textContent = t('settings.check');
        toast(t('toast.alreadyUpToDate'), 'success');
      }
    }).catch(function(e) {
      if (desc) desc.textContent = t('settings.checkFailed');
      if (btn) btn.textContent = t('settings.check');
      toast(t('toast.checkFailed', { error: (e || '') }), 'error');
    });
  },

  _doUpdate: function() {
    if (ui._updating) return;
    ui._updating = true;
    var btn = document.getElementById('btn-check-update');
    var desc = document.getElementById('update-status-text');
    var btext = document.getElementById('update-banner-text');
    var pw = document.getElementById('update-progress-wrap');
    var pf = document.getElementById('update-progress-fill');
    if (btn) btn.textContent = t('toast.updating');
    if (desc) desc.textContent = t('toast.downloading');
    if (btext) btext.textContent = t('updater.downloading');
    if (pw) pw.style.display = 'flex';
    if (pf) { pf.style.width = '100%'; pf.style.animation = 'progressPulse 1.5s ease-in-out infinite'; }
    invoke('do_update').then(function() {
      if (desc) desc.textContent = t('toast.restarting');
      if (btext) btext.textContent = t('updater.restarting');
      toast(t('toast.updateInstalled'), 'success');
    }).catch(function(e) {
      ui._updating = false;
      ui._updateAvailable = false;
      if (pw) pw.style.display = 'none';
      if (pf) pf.style.animation = '';
      if (desc) desc.textContent = t('updater.updateFailed');
      if (btext) btext.textContent = t('updater.failedRetry');
      if (btn) btn.textContent = t('settings.check');
      toast(t('toast.updateFailed'), 'error');
    });
  },
};

// ─── Helpers ────────────────────────────────────────────────────────

function esc(s) { return s ? s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; }

function mtName(m) { if (m.Domain !== undefined) return 'domain'; if (m.Keyword !== undefined) return 'keyword'; if (m.Wildcard !== undefined) return 'wildcard'; if (m.UrlPath !== undefined) return 'url_path'; return 'other'; }
function mtVal(m) { return m.Domain || m.Keyword || m.Wildcard || m.UrlPath || JSON.stringify(m); }
function amtName(m) { if (m.ExecutableName !== undefined) return 'exe'; if (m.ExecutablePath !== undefined) return 'path'; if (m.WindowTitle !== undefined) return 'title'; return 'other'; }
function amtVal(m) { return m.ExecutableName || m.ExecutablePath || m.WindowTitle || JSON.stringify(m); }

function ico(name, sz) {
  sz = sz || 16;
  return '<i data-lucide="' + name + '" style="width:' + sz + 'px;height:' + sz + 'px;"></i>';
}

function refreshIcons() {
  if (window.lucide) lucide.createIcons();
}

function formatTimeAgo(date) {
  var now = new Date();
  var diff = Math.floor((now - date) / 1000);
  if (diff < 5) return t('common.justNow');
  if (diff < 60) return t('common.secondsAgo', { n: diff });
  if (diff < 3600) return t('common.minutesAgo', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('common.hoursAgo', { n: Math.floor(diff / 3600) });
  return t('common.daysAgo', { n: Math.floor(diff / 86400) });
}

function showConfirm(title, message) {
  return new Promise(function(resolve) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    var overlay = document.getElementById('confirm-overlay');
    overlay.classList.remove('hidden');

    var okBtn = document.getElementById('confirm-ok');
    var cancelBtn = document.getElementById('confirm-cancel');

    function cleanup() {
      overlay.classList.add('hidden');
      okBtn.replaceWith(okBtn.cloneNode(true));
      cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    }

    document.getElementById('confirm-ok').addEventListener('click', function() { cleanup(); resolve(true); });
    document.getElementById('confirm-cancel').addEventListener('click', function() { cleanup(); resolve(false); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) { cleanup(); resolve(false); } }, { once: true });
  });
}

function toast(msg, type) {
  var c = document.getElementById('toast-container');
  var el = document.createElement('div');
  el.className = 'toast ' + (type||'info');
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(function() { el.style.opacity = '0'; setTimeout(function() { el.remove(); }, 180); }, 2500);
}

// ─── Event Delegation ───────────────────────────────────────────────

document.addEventListener('click', function(e) {
  var el = e.target;
  // Click-to-copy on rule values (website domains, app names)
  if (el.classList && el.classList.contains('rule-value')) {
    var text = el.textContent.trim();
    navigator.clipboard.writeText(text).then(function() {
      toast(t('toast.copiedToClipboard'), 'success');
    });
    return;
  }
  while (el && el !== document.body) {
    var a = el.getAttribute('data-action');
    // Don't preventDefault on checkboxes — let the change event handle them
    if (a && el.tagName !== 'INPUT') { e.preventDefault(); doAction(a, el); return; }
    if (el.dataset && el.dataset.page && (el.classList.contains('nav-item') || el.classList.contains('quick-action-btn') || el.classList.contains('quick-action-card') || el.tagName === 'BUTTON')) {
      ui.navigateTo(el.dataset.page);
      var targetTab = el.dataset.targetTab;
      if (targetTab) {
        setTimeout(function() {
          var t = document.querySelector('[data-tab="' + targetTab + '"]');
          if (t) t.click();
        }, 50);
      }
      return;
    }
    el = el.parentElement;
  }
  if (e.target.id === 'modal-overlay') ui.closeModal();
});

document.addEventListener('change', function(e) {
  if (e.target.getAttribute('data-action') === 'toggle-list') ui.toggleList(e.target.getAttribute('data-list-id'), e.target.checked);
});

function doAction(a, el) {
  switch (a) {
    case 'delete-list': ui.deleteList(el.getAttribute('data-list-id'), el.getAttribute('data-list-name')); break;
    case 'remove-website': ui.removeWebsite(el.getAttribute('data-list-id'), el.getAttribute('data-rule-id')); break;
    case 'remove-app': ui.removeApp(el.getAttribute('data-list-id'), el.getAttribute('data-rule-id')); break;
    case 'remove-exception': ui.removeException(el.getAttribute('data-list-id'), el.getAttribute('data-exc-id')); break;
    case 'toggle-schedule': break; // handled by schedule drag system
    case 'confirm-create-list': ui.createList(); break;
    case 'confirm-keyword': ui.confirmKeyword(el.getAttribute('data-list-id')); break;
    case 'switch-tab':
      var tabId = el.getAttribute('data-tab');
      el.parentElement.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
      el.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(function(tc) { tc.classList.remove('active'); });
      var target = document.getElementById(tabId);
      if (target) target.classList.add('active');
      if (tabId === 'websites-tab-exceptions') ui.refreshExceptions();
      if (tabId === 'websites-tab-allowances') ui.refreshAllowancesTab();
      break;
    case 'reset-allowance': ui.resetAllowance(el.getAttribute('data-id')); break;
    case 'delete-allowance': ui.deleteAllowance(el.getAttribute('data-id')); break;
    case 'import-text': ui.importFromText(); closeAllDropdowns(); break;
    case 'import-json': ui.importFromText(); closeAllDropdowns(); break;
    case 'import-premade': ui.importPremadeList(el.getAttribute('data-category')); closeAllDropdowns(); break;
    case 'import-keyword-prompt': ui.importKeywordPrompt(); closeAllDropdowns(); break;
    case 'import-entire-internet': ui.importEntireInternet(); closeAllDropdowns(); break;
    case 'clear-all-websites': ui.clearAllWebsites(); break;
    case 'clear-all-apps': ui.clearAllApps(); break;
    case 'edit-schedule':
      // Navigate to schedule tab and select this list
      var schedListId = el.getAttribute('data-list-id');
      ui.navigateTo('schedule');
      setTimeout(function() {
        var sel = document.getElementById('schedule-list-select');
        if (sel) { sel.value = schedListId; ui.refreshSchedule(); }
      }, 100);
      break;
    case 'edit-list':
      var editListId = el.getAttribute('data-list-id');
      ui.navigateTo('websites');
      setTimeout(function() {
        var sel = document.getElementById('website-list-select');
        if (sel) { sel.value = editListId; ui.refreshWebsites(); }
      }, 100);
      break;
    case 'focus-lock': ui.showFocusLockModal(el.getAttribute('data-list-id'), el.getAttribute('data-list-name')); break;
    case 'confirm-focus-lock': ui.activateFocusLock(el.getAttribute('data-list-id')); break;
    case 'close-modal': ui.closeModal(); break;
  }
}

function closeAllDropdowns() {
  document.querySelectorAll('.dropdown-menu').forEach(function(d) { d.classList.add('hidden'); });
}

// ─── Init ───────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async function() {
  // Initialize i18n before any UI rendering
  await i18n.init();
  i18n._applyToDOM();

  // Pull the app version from Cargo.toml (via the get_app_version Tauri
  // command) so the About section and any other version display stays in
  // sync with the workspace version automatically. No more hardcoded
  // version strings to update on each release.
  try {
    var v = await invoke('get_app_version');
    var av = document.getElementById('about-version');
    if (av && v) av.textContent = 'Focuser v' + v;
  } catch (e) { /* non-tauri context, leave the static label */ }

  var b = document.getElementById('btn-new-blocklist'); if (b) b.addEventListener('click', function() { ui.showCreateListModal(); });
  var bw = document.getElementById('btn-add-website'); if (bw) bw.addEventListener('click', function() { ui.addWebsite(); });

  // Settings page buttons
  var bExport = document.getElementById('btn-export-config');
  if (bExport) bExport.addEventListener('click', function() { ui.exportConfiguration(); });
  var bImport = document.getElementById('btn-import-config');
  if (bImport) bImport.addEventListener('click', function() { ui.importConfiguration(); });
  var bClearStats = document.getElementById('btn-clear-stats');
  if (bClearStats) bClearStats.addEventListener('click', function() { ui.clearStatistics(); });
  var bReset = document.getElementById('btn-reset-settings');
  if (bReset) bReset.addEventListener('click', function() { ui.resetSettings(); });
  var bDeleteAll = document.getElementById('btn-delete-all');
  if (bDeleteAll) bDeleteAll.addEventListener('click', function() { ui.deleteAllData(); });
  var bApplyRetention = document.getElementById('btn-apply-retention');
  if (bApplyRetention) bApplyRetention.addEventListener('click', function() { ui.applyRetention(); });
  var bCheckUpdate = document.getElementById('btn-check-update');
  if (bCheckUpdate) bCheckUpdate.addEventListener('click', function() { ui.handleSettingsUpdateBtn(); });

  // Focus: Pomodoro + Allowance
  var bStartPom = document.getElementById('btn-start-pomodoro');
  if (bStartPom) bStartPom.addEventListener('click', function() { ui.openPomodoroStartModal(); });
  var bAddAllow = document.getElementById('btn-add-allowance');
  if (bAddAllow) bAddAllow.addEventListener('click', function() { ui.addAllowance(); });
  ui.startPomodoroPolling();
  ui.startPomodoroEventPolling();
  ui.startAllowanceNotificationPolling();

  // Focus settings
  (async function() {
    try {
      var preset = await invoke('get_setting', { key: 'focus_default_preset', default: 'classic' });
      var sp = document.getElementById('setting-pomo-preset');
      if (sp && preset) { sp.value = preset; ui._pomodoroPreset = preset; }

      var strict = await invoke('get_setting', { key: 'focus_allowance_strict_default', default: 'true' });
      var st = document.getElementById('setting-allowance-strict');
      if (st) st.checked = (strict !== 'false');

      var notif = await invoke('get_setting', { key: 'focus_pomo_notifications', default: 'true' });
      ui._pomodoroNotifEnabled = (notif !== 'false');
      var pn = document.getElementById('setting-pomo-notifications');
      if (pn) pn.checked = ui._pomodoroNotifEnabled;
    } catch (e) {}
  })();

  var sp = document.getElementById('setting-pomo-preset');
  if (sp) sp.addEventListener('change', function() {
    ui._pomodoroPreset = this.value;
    invoke('set_setting', { key: 'focus_default_preset', value: this.value })
      .catch(function() {});
  });
  var st = document.getElementById('setting-allowance-strict');
  if (st) st.addEventListener('change', function() {
    invoke('set_setting', { key: 'focus_allowance_strict_default', value: this.checked ? 'true' : 'false' })
      .catch(function() {});
    var ai = document.getElementById('allowance-strict-input');
    if (ai) ai.checked = this.checked;
  });
  var pn = document.getElementById('setting-pomo-notifications');
  if (pn) pn.addEventListener('change', function() {
    ui._pomodoroNotifEnabled = this.checked;
    invoke('set_setting', { key: 'focus_pomo_notifications', value: this.checked ? 'true' : 'false' })
      .catch(function() {});
  });
  var rInput = document.getElementById('setting-retention-input');
  if (rInput) {
    rInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); ui.applyRetention(); }
    });
  }
  // Load current retention value
  (async function() {
    try {
      var days = await invoke('get_stats_retention');
      var input = document.getElementById('setting-retention-input');
      if (input && days) input.value = days;
    } catch (e) {}
  })();
  var be = document.getElementById('btn-add-exception'); if (be) be.addEventListener('click', function() { ui.addException(); });
  var ba = document.getElementById('btn-add-app'); if (ba) ba.addEventListener('click', function() { ui.addApp(); });
  var bi = document.getElementById('btn-import-dropdown'); if (bi) bi.addEventListener('click', function(e) { e.stopPropagation(); ui.toggleImportDropdown(); });
  var bb = document.getElementById('btn-browse-apps'); if (bb) bb.addEventListener('click', function() { ui.browseApps(); });

  // Language switch buttons
  document.querySelectorAll('.lang-btn').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var newLocale = this.getAttribute('data-lang');
      if (newLocale === i18n.locale) return;
      var ok = await i18n.setLocale(newLocale);
      if (ok) {
        // Update active button state
        document.querySelectorAll('.lang-btn').forEach(function(b) {
          b.classList.toggle('active', b.getAttribute('data-lang') === newLocale);
        });
        // Re-render current page
        if (state.currentPage) ui.navigateTo(state.currentPage);
      } else {
        toast(t('common.failed', { error: 'Failed to switch language' }), 'error');
      }
    });
  });
  // Set initial active button
  document.querySelectorAll('.lang-btn').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-lang') === i18n.locale);
  });

  // Real-time search filters
  var sw = document.getElementById('search-websites');
  if (sw) sw.addEventListener('input', function() { ui.renderFilteredWebsites(this.value); });
  var sa = document.getElementById('search-apps');
  if (sa) sa.addEventListener('input', function() { ui.renderFilteredApps(this.value); });

  // Refresh lists when select dropdown changes
  var wls = document.getElementById('website-list-select');
  if (wls) wls.addEventListener('change', function() { ui.refreshWebsites(); });
  var als = document.getElementById('app-list-select');
  if (als) als.addEventListener('change', function() { ui.refreshApps(); });
  // Stats time range buttons
  document.querySelectorAll('.stats-range-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { ui._statsRange = btn.getAttribute('data-range'); ui.refreshStatistics(); });
  });

  // Schedule list select → reload grid with that list's schedule
  var sls = document.getElementById('schedule-list-select');
  if (sls) sls.addEventListener('change', function() { ui._scheduleManualMode = false; ui.refreshSchedule(); });

  // Mode toggle buttons (Always Active / Scheduled)
  var modeAlwaysBtn = document.getElementById('mode-always');
  if (modeAlwaysBtn) modeAlwaysBtn.addEventListener('click', async function() {
    var sel = document.getElementById('schedule-list-select');
    if (!sel || !sel.value) { toast(t('toast.selectListFirst'), 'error'); return; }
    document.querySelectorAll('.schedule-cell.active').forEach(function(c) { c.classList.remove('active'); });
    ui._scheduleManualMode = false;
    await ui._saveSchedule(true);
    toast(t('toast.setToAlwaysActive'), 'success');
    ui.refreshSchedule();
  });

  var modeScheduledBtn = document.getElementById('mode-scheduled');
  if (modeScheduledBtn) modeScheduledBtn.addEventListener('click', async function() {
    var sel = document.getElementById('schedule-list-select');
    if (!sel || !sel.value) { toast(t('toast.selectListFirst'), 'error'); return; }
    ui._scheduleManualMode = true;
    await ui._saveSchedule(false);
    toast(t('toast.switchedToScheduled'), 'info');
    ui.refreshSchedule();
  });

  // Clear schedule button
  var bcs = document.getElementById('btn-clear-schedule');
  if (bcs) bcs.addEventListener('click', async function() {
    document.querySelectorAll('.schedule-cell.active').forEach(function(c) { c.classList.remove('active'); });
    await ui._saveSchedule();
    toast(t('toast.scheduleCleared'), 'success');
    ui.refreshSchedule();
  });

  // Preset buttons
  document.querySelectorAll('.schedule-preset-btn[data-preset]').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var sel = document.getElementById('schedule-list-select');
      if (!sel || !sel.value) { toast(t('toast.selectListFirst'), 'error'); return; }
      var preset = btn.getAttribute('data-preset');
      await ui._applySchedulePreset(preset);
      toast(t('toast.presetApplied'), 'success');
      ui.refreshSchedule();
    });
  });

  // Redraw charts on window resize (prevents stretched/blurry canvas)
  var resizeTimer = null;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      if (state.currentPage === 'statistics') ui.refreshStatistics();
    }, 150);
  });

  // Auto-refresh statistics every 5 seconds when on the statistics page
  setInterval(function() {
    if (state.currentPage === 'statistics') ui.refreshStatistics();
  }, 5000);

  // Close dropdowns on outside click
  document.addEventListener('click', function() { closeAllDropdowns(); });
  var mc = document.getElementById('btn-modal-close'); if (mc) mc.addEventListener('click', function() { ui.closeModal(); });
  var mx = document.getElementById('btn-modal-cancel'); if (mx) mx.addEventListener('click', function() { ui.closeModal(); });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') ui.closeModal();
    if (e.key === 'Enter') { var ov = document.getElementById('modal-overlay'); if (ov && !ov.classList.contains('hidden')) { var cb = document.getElementById('modal-confirm'); if (cb) cb.click(); } }
  });

  // Autostart toggle
  var autoEl = document.getElementById('setting-autostart');
  if (autoEl) {
    // Check current state
    try {
      if (window.__TAURI__ && window.__TAURI__.core) {
        var enabled = await window.__TAURI__.core.invoke('plugin:autostart|is_enabled');
        autoEl.checked = enabled;
      }
    } catch (e) {}
    autoEl.addEventListener('change', async function() {
      try {
        if (this.checked) {
          await window.__TAURI__.core.invoke('plugin:autostart|enable');
          toast(t('toast.autoStartEnabled'), 'success');
        } else {
          await window.__TAURI__.core.invoke('plugin:autostart|disable');
          toast(t('toast.autoStartDisabled'), 'success');
        }
      } catch (e) { toast(t('common.failed', { error: e }), 'error'); }
    });
  }

  try { state.blockLists = await invoke('list_block_lists'); } catch (e) { state.blockLists = []; }
  ui.loadPremadeLists();
  refreshIcons();
  ui.navigateTo('dashboard');
  setInterval(function() { if (state.currentPage === 'dashboard') ui.refreshDashboard(); }, 5000);

  setTimeout(function() { ui.handleSettingsUpdateBtn(); }, 3000);

  // ── Cursor spotlight glow on cards/panels ───────────────────────
  setupSpotlightGlow();

  // ── Enhance all native selects with custom dropdown UI ──────────
  enhanceAllSelects();
});

// ─── Custom Dropdown Component ──────────────────────────────────────
// Wraps a native <select> with a custom styled UI. Keeps the native
// element for state, forms, and events. Modular — change styles/behavior
// from one place.

function enhanceSelect(selectEl) {
  if (!selectEl || selectEl.__ddEnhanced) return;
  selectEl.__ddEnhanced = true;

  var wrap = document.createElement('div');
  wrap.className = 'dd-wrap';

  // Preserve sizing from the original element
  if (selectEl.style.width) wrap.style.width = selectEl.style.width;
  if (selectEl.classList.contains('dd-block')) wrap.classList.add('dd-block');

  var trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'dd-trigger';
  trigger.innerHTML =
    '<span class="dd-label"></span>' +
    '<i data-lucide="chevron-down" class="dd-chev"></i>';

  var menu = document.createElement('div');
  menu.className = 'dd-menu hidden';

  // Insert wrap before select, move select into wrap
  selectEl.parentNode.insertBefore(wrap, selectEl);
  wrap.appendChild(trigger);
  wrap.appendChild(menu);
  wrap.appendChild(selectEl);
  selectEl.classList.add('dd-native');

  function syncTrigger() {
    var labelEl = trigger.querySelector('.dd-label');
    var selected = selectEl.options[selectEl.selectedIndex];
    if (selected) {
      labelEl.textContent = selected.textContent;
      if (!selected.value) labelEl.classList.add('dd-placeholder');
      else labelEl.classList.remove('dd-placeholder');
    } else {
      labelEl.textContent = t('common.selectList');
      labelEl.classList.add('dd-placeholder');
    }
  }

  function rebuildMenu() {
    menu.innerHTML = '';
    var opts = Array.from(selectEl.options);
    if (opts.length === 0) {
      menu.innerHTML = '<div class="dd-empty">' + t('common.noOptions') + '</div>';
      return;
    }
    opts.forEach(function(opt, i) {
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'dd-item';
      if (opt.value === selectEl.value) item.classList.add('selected');
      if (!opt.value && i === 0 && opts.length > 1) item.classList.add('dd-placeholder');
      var labelSpan = document.createElement('span');
      labelSpan.textContent = opt.textContent;
      item.appendChild(labelSpan);
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        selectEl.value = opt.value;
        syncTrigger();
        closeMenu();
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      });
      menu.appendChild(item);
    });
  }

  function openMenu() {
    closeAllCustomDropdowns();
    rebuildMenu();
    menu.classList.remove('hidden');
    wrap.classList.add('open');
    refreshIcons();
  }

  function closeMenu() {
    menu.classList.add('hidden');
    wrap.classList.remove('open');
  }

  wrap.__ddClose = closeMenu;
  wrap.__ddSync = syncTrigger;

  trigger.addEventListener('click', function(e) {
    e.stopPropagation();
    if (wrap.classList.contains('open')) closeMenu();
    else openMenu();
  });

  trigger.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger.click(); }
    if (e.key === 'Escape') closeMenu();
  });

  // Watch for programmatic changes to options/value
  var observer = new MutationObserver(function() {
    syncTrigger();
    if (wrap.classList.contains('open')) rebuildMenu();
  });
  observer.observe(selectEl, { childList: true, attributes: true, attributeFilter: ['value'] });

  // Also sync when the native change event fires (e.g., from JS setting .value)
  var origDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  if (origDescriptor && origDescriptor.set) {
    try {
      Object.defineProperty(selectEl, 'value', {
        get: function() { return origDescriptor.get.call(this); },
        set: function(v) {
          origDescriptor.set.call(this, v);
          syncTrigger();
        },
        configurable: true
      });
    } catch (e) {}
  }

  syncTrigger();
  refreshIcons();
}

function enhanceAllSelects() {
  document.querySelectorAll('select.input').forEach(enhanceSelect);
}

function closeAllCustomDropdowns() {
  document.querySelectorAll('.dd-wrap.open').forEach(function(w) {
    if (w.__ddClose) w.__ddClose();
  });
}

// Close any open custom dropdown on outside click
document.addEventListener('click', function(e) {
  if (!e.target.closest('.dd-wrap')) closeAllCustomDropdowns();
});

function setupSpotlightGlow() {
  document.addEventListener('mousemove', function(e) {
    var cards = document.querySelectorAll('.glow-card');
    cards.forEach(function(card) {
      var rect = card.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', x + 'px');
      card.style.setProperty('--mouse-y', y + 'px');
    });
  });

  // Apply glow-card class to interactive elements
  var glowObserver = new MutationObserver(applyGlowClasses);
  glowObserver.observe(document.getElementById('content'), { childList: true, subtree: true });
  applyGlowClasses();
}

function applyGlowClasses() {
  document.querySelectorAll('.stat-card, .blocklist-card, .quick-action-card, .mini-list-card').forEach(function(el) {
    if (!el.classList.contains('glow-card')) el.classList.add('glow-card');
  });
}
