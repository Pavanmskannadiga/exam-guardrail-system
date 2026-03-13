/* ═══════════════════════════════════════════════════════════════
   Admin.js — Auditor Dashboard Logic
   Real-time WebSocket + REST hydration, timeline, trust score
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── State ───────────────────────────────────────────────────
  const studentsData = {}; // { studentId: { violations:[], trustScore:100, connected:bool } }
  let selectedStudent = null;
  let ws = null;

  // ── Icons / Labels ──────────────────────────────────────────
  const TYPE_ICON = {
    'tab-switch': '🚪',
    'window-resize': '📐',
    'keyboard': '⌨️',
    'idle': '😴',
    'connected': '🟢',
    'disconnected': '🔴'
  };

  const TYPE_LABEL = {
    'tab-switch': 'Tab Switch',
    'window-resize': 'Window Resize',
    'keyboard': 'Keyboard Shortcut',
    'idle': 'Idle Timeout',
    'connected': 'Connected',
    'disconnected': 'Disconnected'
  };

  const TYPE_CSS = {
    'tab-switch': 'icon-tab-switch',
    'window-resize': 'icon-window-resize',
    'keyboard': 'icon-keyboard',
    'idle': 'icon-idle',
    'connected': 'icon-connected',
    'disconnected': 'icon-disconnected'
  };

  // ── Init ────────────────────────────────────────────────────
  async function init() {
    await hydrate();
    connectWS();
  }

  // ── Hydrate from REST ───────────────────────────────────────
  async function hydrate() {
    try {
      const res = await fetch('/api/violations');
      const data = await res.json();
      for (const [id, info] of Object.entries(data)) {
        studentsData[id] = {
          violations: info.violations || [],
          trustScore: info.trustScore ?? 100,
          connected: info.connected ?? false
        };
      }
      renderStudentList();
      updateHeaderStats();
    } catch (err) {
      console.error('Hydration failed', err);
    }
  }

  // ── WebSocket ───────────────────────────────────────────────
  function connectWS() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${protocol}://${location.host}?role=admin`);

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        handleWSMessage(msg);
      } catch (_) { /* ignore */ }
    };

    ws.onclose = () => setTimeout(connectWS, 3000);
  }

  function handleWSMessage(msg) {
    const { event, studentId, violation, trustScore, totalViolations, timestamp } = msg;

    if (event === 'student-connected') {
      if (!studentsData[studentId]) {
        studentsData[studentId] = { violations: [], trustScore: 100, connected: true };
      }
      studentsData[studentId].connected = true;
      // Add system event to timeline
      studentsData[studentId].violations.push({
        type: 'connected',
        timestamp,
        detail: { message: 'Student joined the exam' }
      });
      renderStudentList();
      if (selectedStudent === studentId) renderMainPanel();
    }

    else if (event === 'student-disconnected') {
      if (studentsData[studentId]) {
        studentsData[studentId].connected = false;
        studentsData[studentId].violations.push({
          type: 'disconnected',
          timestamp,
          detail: { message: 'Student left the exam' }
        });
      }
      renderStudentList();
      if (selectedStudent === studentId) renderMainPanel();
    }

    else if (event === 'violation') {
      if (!studentsData[studentId]) {
        studentsData[studentId] = { violations: [], trustScore: 100, connected: true };
      }
      studentsData[studentId].violations.push(violation);
      studentsData[studentId].trustScore = trustScore;
      renderStudentList();
      if (selectedStudent === studentId) renderMainPanel();
    }

    updateHeaderStats();
  }

  // ── Render Student List ─────────────────────────────────────
  function renderStudentList() {
    const list = document.getElementById('studentList');
    const ids = Object.keys(studentsData);

    if (ids.length === 0) {
      list.innerHTML = '<li class="no-students" id="noStudentsMsg">Waiting for students to connect…</li>';
      return;
    }

    list.innerHTML = ids.map(id => {
      const s = studentsData[id];
      const score = s.trustScore;
      const violationCount = s.violations.filter(v => !['connected','disconnected'].includes(v.type)).length;
      const scoreClass = score >= 70 ? 'score-high' : score >= 40 ? 'score-medium' : 'score-low';
      const dotClass = s.connected ? 'dot-online' : 'dot-danger';
      const active = selectedStudent === id ? ' active' : '';

      return `
        <li class="student-card${active}" onclick="window.__selectStudent('${id}')">
          <div class="student-avatar">${id.charAt(0).toUpperCase()}</div>
          <div class="student-info">
            <div class="student-name-row">
              <span class="student-card-name">${escHtml(id)}</span>
              <span class="connection-dot ${dotClass}"></span>
            </div>
            <div class="student-meta">
              <span class="mini-score ${scoreClass}">${score}</span>
              <span>${violationCount} violation${violationCount !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </li>`;
    }).join('');
  }

  // ── Select Student ──────────────────────────────────────────
  window.__selectStudent = function (id) {
    selectedStudent = id;
    renderStudentList();
    renderMainPanel();
  };

  // ── Render Main Panel ───────────────────────────────────────
  function renderMainPanel() {
    const panel = document.getElementById('mainPanel');
    if (!selectedStudent || !studentsData[selectedStudent]) {
      panel.innerHTML = `
        <div class="select-prompt" id="selectPrompt">
          <div class="promo-icon">📋</div>
          <h2>Select a student</h2>
          <p>Choose a student from the sidebar to view their real-time violation timeline and trust score.</p>
        </div>`;
      return;
    }

    const s = studentsData[selectedStudent];
    const score = s.trustScore;
    const violations = s.violations.filter(v => !['connected','disconnected'].includes(v.type));
    const tabSwitches = violations.filter(v => v.type === 'tab-switch').length;
    const resizes = violations.filter(v => v.type === 'window-resize').length;
    const keyboard = violations.filter(v => v.type === 'keyboard').length;
    const idles = violations.filter(v => v.type === 'idle').length;

    const scoreClass = score >= 70 ? 'trust-high' : score >= 40 ? 'trust-medium' : 'trust-low';
    const gaugeColor = score >= 70
      ? 'linear-gradient(90deg, #10b981, #34d399)'
      : score >= 40
        ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
        : 'linear-gradient(90deg, #ef4444, #f87171)';

    // Metric cards
    const metricsHTML = `
      <div class="score-section">
        <div class="metric-card">
          <div class="metric-label">Trust Score</div>
          <div class="metric-value ${scoreClass}">${score}</div>
          <div class="trust-gauge"><div class="trust-gauge-fill" style="width:${score}%; background:${gaugeColor};"></div></div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Tab Switches</div>
          <div class="metric-value">${tabSwitches}</div>
          <div class="metric-sub">🚪 −5 pts each + time</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Resize Flags</div>
          <div class="metric-value">${resizes}</div>
          <div class="metric-sub">📐 −8 pts each</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Key / Idle</div>
          <div class="metric-value">${keyboard + idles}</div>
          <div class="metric-sub">⌨️ −3  |  😴 −4 pts</div>
        </div>
      </div>`;

    // Timeline
    const allEvents = [...s.violations].reverse();
    let timelineRows = '';
    if (allEvents.length === 0) {
      timelineRows = `
        <div class="empty-timeline">
          <div class="empty-icon">📭</div>
          <div>No events recorded yet</div>
        </div>`;
    } else {
      timelineRows = allEvents.map(v => {
        const icon = TYPE_ICON[v.type] || '⚠️';
        const iconClass = TYPE_CSS[v.type] || '';
        const label = TYPE_LABEL[v.type] || v.type;
        const detail = v.detail?.message || '';
        const time = formatTime(v.timestamp);

        return `
          <li class="timeline-entry">
            <div class="timeline-icon ${iconClass}">${icon}</div>
            <div class="timeline-body">
              <div class="timeline-body-title">${escHtml(label)}</div>
              <div class="timeline-body-detail">${escHtml(detail)}</div>
            </div>
            <div class="timeline-time">${time}</div>
          </li>`;
      }).join('');
    }

    panel.innerHTML = `
      ${metricsHTML}
      <div class="timeline-section">
        <div class="timeline-header">
          <div class="timeline-title">Violation Timeline — ${escHtml(selectedStudent)}</div>
          ${s.connected
            ? '<div class="live-badge"><span class="live-dot"></span> Live</div>'
            : '<div class="live-badge offline-badge"><span class="offline-dot"></span> Offline</div>'
          }
        </div>
        <ul class="timeline-list">${timelineRows}</ul>
      </div>`;
  }

  // ── Header Stats ────────────────────────────────────────────
  function updateHeaderStats() {
    const ids = Object.keys(studentsData);
    const online = ids.filter(id => studentsData[id].connected).length;
    const totalV = ids.reduce((sum, id) =>
      sum + studentsData[id].violations.filter(v => !['connected','disconnected'].includes(v.type)).length, 0);
    const flagged = ids.filter(id => studentsData[id].trustScore < 50).length;

    document.getElementById('onlineCount').textContent = online;
    document.getElementById('totalViolations').textContent = totalV;
    document.getElementById('flaggedCount').textContent = flagged;
  }

  // ── Helpers ─────────────────────────────────────────────────
  function formatTime(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return ts; }
  }

  function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Boot ────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
