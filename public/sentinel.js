/* ═══════════════════════════════════════════════════════════════
   Sentinel.js — Exam Guardrail Monitoring Engine
   Monitors: tab-switch, window-resize, keyboard hijack, idle
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────
  const IDLE_TIMEOUT_MS = 60_000; // 60 seconds
  const RESIZE_THRESHOLD = 0.80; // 80% of screen area
  const WS_RECONNECT_MS = 3_000;

  // ── State ───────────────────────────────────────────────────
  let ws = null;
  let studentId = 'Unknown';
  let examCode = '';
  let violationCount = 0;
  let blurStartTime = null;
  let idleTimer = null;
  let isIdle = false;
  let examSubmitted = false;
  let examTimeRemaining = 30 * 60; // 30 minutes in seconds
  let timerInterval = null;

  // ── Initialise (called after login) ─────────────────────────
  function init(name, code) {
    studentId = name;
    examCode = code || '';

    // Update UI
    const nameEl = document.getElementById('studentName');
    const avatarEl = document.getElementById('avatarInitial');
    if (nameEl) nameEl.textContent = studentId;
    if (avatarEl) avatarEl.textContent = studentId.charAt(0).toUpperCase();

    connectWebSocket();
    setupTabSwitchDetection();
    setupResizeDetection();
    setupKeyboardHijacking();
    setupIdleDetection();
    startExamTimer();
  }

  // ── WebSocket ───────────────────────────────────────────────
  function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${location.host}?student=${encodeURIComponent(studentId)}&examCode=${encodeURIComponent(examCode)}`;

    ws = new WebSocket(url);
    ws.onopen = () => console.log('[Sentinel] Connected to server');
    ws.onclose = () => {
      if (examSubmitted) return;
      console.log('[Sentinel] Disconnected — reconnecting…');
      setTimeout(connectWebSocket, WS_RECONNECT_MS);
    };
    ws.onerror = (e) => console.error('[Sentinel] WS error', e);
  }

  function sendViolation(type, detail) {
    if (examSubmitted) return; // Stop logging after submission
    violationCount++;
    const payload = {
      type,
      detail,
      timestamp: new Date().toISOString()
    };

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }

    updateStatusBar();
    showToast(type, detail);
  }

  // ── 1. Tab-Switch Detection ─────────────────────────────────
  function setupTabSwitchDetection() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        blurStartTime = Date.now();
      } else if (blurStartTime) {
        const secondsAway = Math.round((Date.now() - blurStartTime) / 1000);
        blurStartTime = null;
        sendViolation('tab-switch', {
          secondsAway,
          message: `Left exam tab for ${secondsAway}s`
        });
      }
    });

    // Also listen to window blur/focus as a fallback
    window.addEventListener('blur', () => {
      if (!blurStartTime) blurStartTime = Date.now();
    });

    window.addEventListener('focus', () => {
      if (blurStartTime) {
        const secondsAway = Math.round((Date.now() - blurStartTime) / 1000);
        blurStartTime = null;
        if (secondsAway >= 1) {
          sendViolation('tab-switch', {
            secondsAway,
            message: `Window lost focus for ${secondsAway}s`
          });
        }
      }
    });
  }

  // ── 2. Window Resize Detection ──────────────────────────────
  function setupResizeDetection() {
    const fullArea = screen.width * screen.height;
    let resizeFlagged = false;

    function checkSize() {
      const currentArea = window.innerWidth * window.innerHeight;
      const ratio = currentArea / fullArea;

      if (ratio < RESIZE_THRESHOLD) {
        if (!resizeFlagged) {
          resizeFlagged = true;
          sendViolation('window-resize', {
            ratio: Math.round(ratio * 100),
            message: `Window shrunk to ${Math.round(ratio * 100)}% of screen`
          });
        }
      } else {
        resizeFlagged = false; // Reset so next shrink is flagged
      }
    }

    window.addEventListener('resize', checkSize);
    // Initial check
    checkSize();
  }

  // ── 3. Keyboard Hijacking ──────────────────────────────────
  function setupKeyboardHijacking() {
    const BLOCKED_COMBOS = [
      { ctrl: true, key: 'c', label: 'Ctrl+C (Copy)' },
      { ctrl: true, key: 'v', label: 'Ctrl+V (Paste)' },
      { ctrl: true, key: 'u', label: 'Ctrl+U (View Source)' },
      { ctrl: true, shift: true, key: 'i', label: 'Ctrl+Shift+I (DevTools)' },
      { ctrl: true, shift: true, key: 'j', label: 'Ctrl+Shift+J (Console)' },
      { key: 'F12', label: 'F12 (Inspect Element)' },
      { key: 'PrintScreen', label: 'Print Screen' },
    ];

    document.addEventListener('keydown', (e) => {
      for (const combo of BLOCKED_COMBOS) {
        const ctrlMatch = combo.ctrl ? (e.ctrlKey || e.metaKey) : true;
        const shiftMatch = combo.shift ? e.shiftKey : !combo.shift;
        const keyMatch = e.key && e.key.toLowerCase() === combo.key.toLowerCase();

        if (ctrlMatch && shiftMatch && keyMatch) {
          e.preventDefault();
          e.stopPropagation();
          sendViolation('keyboard', {
            keys: combo.label,
            message: `Blocked: ${combo.label}`
          });
          return false;
        }
      }
    }, true);

    // Disable right-click context menu
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      sendViolation('keyboard', {
        keys: 'Right Click',
        message: 'Blocked: Right-click context menu'
      });
    });
  }

  // ── 4. Idle Detection ──────────────────────────────────────
  function setupIdleDetection() {
    function resetIdle() {
      if (isIdle) {
        isIdle = false;
        const overlay = document.getElementById('idleOverlay');
        if (overlay) overlay.classList.remove('visible');
      }
      clearTimeout(idleTimer);
      idleTimer = setTimeout(onIdle, IDLE_TIMEOUT_MS);
    }

    function onIdle() {
      isIdle = true;
      sendViolation('idle', {
        message: 'No activity for 60 seconds'
      });
      const overlay = document.getElementById('idleOverlay');
      if (overlay) overlay.classList.add('visible');
    }

    document.addEventListener('mousemove', resetIdle);
    document.addEventListener('keydown', resetIdle);
    document.addEventListener('click', resetIdle);
    document.addEventListener('scroll', resetIdle);
    // Start the timer
    resetIdle();
  }

  // ── Exam Timer ──────────────────────────────────────────────
  function startExamTimer() {
    const timerEl = document.getElementById('examTimer');
    timerInterval = setInterval(() => {
      if (examSubmitted) return;
      examTimeRemaining--;
      if (examTimeRemaining <= 0) {
        clearInterval(timerInterval);
        examTimeRemaining = 0;
        // Auto-submit when time runs out
        window.submitExam && window.submitExam();
      }
      const mins = Math.floor(examTimeRemaining / 60);
      const secs = examTimeRemaining % 60;
      timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      // Colour warnings
      timerEl.classList.remove('warning', 'danger');
      if (examTimeRemaining <= 60) timerEl.classList.add('danger');
      else if (examTimeRemaining <= 300) timerEl.classList.add('warning');
    }, 1000);
  }

  // ── Stop Sentinel (called on exam submit) ───────────────────
  function stopSentinel() {
    examSubmitted = true;
    clearInterval(timerInterval);
    clearTimeout(idleTimer);
    // Close WebSocket gracefully
    if (ws) {
      ws.onclose = null; // prevent reconnect
      ws.close();
    }
    // Hide idle overlay if visible
    const overlay = document.getElementById('idleOverlay');
    if (overlay) overlay.classList.remove('visible');
  }

  // Expose globally so the submit button can call it
  window.stopSentinel = stopSentinel;

  // Expose startSentinel so login form can trigger it
  window.startSentinel = function (name, code) {
    init(name, code);
  };

  // ── UI Helpers ──────────────────────────────────────────────
  function updateStatusBar() {
    const bar = document.getElementById('statusBar');
    const text = document.getElementById('statusText');
    const badge = document.getElementById('violationBadge');

    if (violationCount > 0) {
      bar.classList.add('has-violations');
      text.textContent = `⚠ ${violationCount} violation${violationCount > 1 ? 's' : ''} recorded — your activity is being monitored`;
    }
    badge.textContent = `${violationCount} violation${violationCount !== 1 ? 's' : ''}`;
  }

  const TOAST_ICONS = {
    'tab-switch': '🚪',
    'window-resize': '📐',
    'keyboard': '⌨️',
    'idle': '😴'
  };

  const TOAST_TITLES = {
    'tab-switch': 'Tab Switch Detected',
    'window-resize': 'Window Resize Detected',
    'keyboard': 'Keyboard Shortcut Blocked',
    'idle': 'Idle Timeout'
  };

  function showToast(type, detail) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <span class="toast-icon">${TOAST_ICONS[type] || '⚠️'}</span>
      <div class="toast-body">
        <div class="toast-title">${TOAST_TITLES[type] || 'Violation'}</div>
        <div class="toast-msg">${detail.message || ''}</div>
      </div>
    `;
    container.appendChild(toast);

    // Auto-remove after 4 s
    setTimeout(() => {
      toast.classList.add('fade-out');
      toast.addEventListener('animationend', () => toast.remove());
    }, 4000);
  }

  // ── No auto-boot — wait for login ──────────────────────────
  // Particles animation for the login screen
  (function spawnParticles() {
    const container = document.getElementById('loginParticles');
    if (!container) return;
    for (let i = 0; i < 20; i++) {
      const p = document.createElement('div');
      p.className = 'login-particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.animationDuration = (6 + Math.random() * 8) + 's';
      p.style.animationDelay = (Math.random() * 6) + 's';
      p.style.width = p.style.height = (2 + Math.random() * 4) + 'px';
      const colors = [
        'rgba(99, 102, 241, 0.4)',
        'rgba(139, 92, 246, 0.4)',
        'rgba(168, 85, 247, 0.3)',
        'rgba(236, 72, 153, 0.3)'
      ];
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      container.appendChild(p);
    }
  })();
})();
