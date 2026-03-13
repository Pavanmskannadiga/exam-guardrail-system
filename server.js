const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

// ── MongoDB ────────────────────────────────────────────────────
const connectDB = require('./db');
const Student = require('./models/Student');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ── Trust Score Calculation ────────────────────────────────────
function calculateTrustScore(violations) {
  let penalty = 0;
  for (const v of violations) {
    switch (v.type) {
      case 'tab-switch':
        penalty += 5;
        if (v.detail && v.detail.secondsAway) {
          penalty += v.detail.secondsAway * 0.5;
        }
        break;
      case 'window-resize':
        penalty += 8;
        break;
      case 'keyboard':
        penalty += 3;
        break;
      case 'idle':
        penalty += 4;
        break;
    }
  }
  return Math.max(0, Math.round(100 - penalty));
}

// ── WebSocket Handling ─────────────────────────────────────────
const adminClients = new Set();

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const role = url.searchParams.get('role');

  if (role === 'admin') {
    // Admin dashboard connection
    adminClients.add(ws);
    ws.on('close', () => adminClients.delete(ws));
    return;
  }

  // Student exam client connection
  const studentId = url.searchParams.get('student') || 'Unknown';
  const examCode = url.searchParams.get('examCode') || '';

  // Upsert student in MongoDB
  try {
    await Student.findOneAndUpdate(
      { studentId },
      { studentId, examCode, connected: true },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    console.error('DB error on student connect:', err.message);
  }

  // Notify admins of new student connection
  broadcastToAdmins({
    event: 'student-connected',
    studentId,
    timestamp: new Date().toISOString()
  });

  ws.on('message', async (data) => {
    try {
      const violation = JSON.parse(data.toString());
      violation.timestamp = violation.timestamp || new Date().toISOString();
      violation.studentId = studentId;

      // Push violation into MongoDB and recalculate trust score
      const student = await Student.findOneAndUpdate(
        { studentId },
        { $push: { violations: { type: violation.type, detail: violation.detail, timestamp: violation.timestamp } } },
        { new: true }
      );

      if (student) {
        const trustScore = calculateTrustScore(student.violations);
        await Student.updateOne({ studentId }, { trustScore });

        // Broadcast violation + updated score to all admin clients
        broadcastToAdmins({
          event: 'violation',
          violation,
          studentId,
          trustScore,
          totalViolations: student.violations.length
        });
      }
    } catch (err) {
      console.error('Bad message from student:', err.message);
    }
  });

  ws.on('close', async () => {
    try {
      await Student.updateOne({ studentId }, { connected: false });
    } catch (err) {
      console.error('DB error on student disconnect:', err.message);
    }
    broadcastToAdmins({
      event: 'student-disconnected',
      studentId,
      timestamp: new Date().toISOString()
    });
  });
});

function broadcastToAdmins(payload) {
  const msg = JSON.stringify(payload);
  for (const client of adminClients) {
    if (client.readyState === 1) client.send(msg);
  }
}

// ── REST API ───────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/violations', async (req, res) => {
  try {
    const students = await Student.find({}).lean();
    const result = {};
    for (const s of students) {
      result[s.studentId] = {
        violations: s.violations,
        trustScore: s.trustScore,
        connected: s.connected,
        examCode: s.examCode,
        createdAt: s.createdAt
      };
    }
    res.json(result);
  } catch (err) {
    console.error('API error:', err.message);
    res.status(500).json({ error: 'Failed to fetch violations' });
  }
});

// ── Serve Pages ────────────────────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

async function boot() {
  await connectDB();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🛡️  Exam Guardrail System running on http://localhost:${PORT}`);
    console.log(`   Exam page:  http://localhost:${PORT}/`);
    console.log(`   Dashboard:  http://localhost:${PORT}/admin`);
  });
}

boot().catch(err => {
  console.error('❌ Failed to start:', err.message);
  process.exit(1);
});
