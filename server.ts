import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { ClaimStatus, ClaimRequest, AdminLog, SystemStats } from "./src/types.js";

// Make sure to use relative import correctly or path alias
const app = express();
const PORT = 3000;

// Setup database paths and structure
const DB_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DB_DIR, "db.json");

interface DBStructure {
  claims: ClaimRequest[];
  logs: AdminLog[];
  blockedIps: string[];
  blockedFingerprints: string[];
}

// In-Memory Database State with Local Persistence
let db: DBStructure = {
  claims: [],
  logs: [],
  blockedIps: [],
  blockedFingerprints: [],
};

// Initialize DB
function initDb() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (fs.existsSync(DB_FILE)) {
    try {
      const data = fs.readFileSync(DB_FILE, "utf-8");
      db = JSON.parse(data);
      // Ensure arrays exist
      db.claims = db.claims || [];
      db.logs = db.logs || [];
      db.blockedIps = db.blockedIps || [];
      db.blockedFingerprints = db.blockedFingerprints || [];
    } catch (e) {
      console.error("Error reading database file, starting fresh", e);
    }
  } else {
    saveDb();
  }
}

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (e) {
    console.error("Error saving database file", e);
  }
}

initDb();

// Request Rate Limiting
const recentRequests = new Map<string, number[]>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 15; // Max 15 requests/minute

  let timestamps = recentRequests.get(ip) || [];
  timestamps = timestamps.filter((t) => now - t < windowMs);
  timestamps.push(now);
  recentRequests.set(ip, timestamps);

  return timestamps.length > maxRequests;
}

// Extract Client IP address
function getClientIp(req: express.Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    if (typeof forwarded === "string") {
      return forwarded.split(",")[0].trim();
    } else if (Array.isArray(forwarded) && forwarded.length > 0) {
      return forwarded[0].trim();
    }
  }
  return req.ip || req.socket.remoteAddress || "127.0.0.1";
}

// Basic Middleware
app.use(express.json());

// Log Helper
function logAdminAction(action: string, code: string, ip: string) {
  const log: AdminLog = {
    id: "LOG_" + Math.random().toString(36).substring(2, 11).toUpperCase(),
    adminAction: action,
    targetCode: code,
    timestamp: new Date().toISOString(),
    adminIp: ip,
  };
  db.logs.unshift(log);
  saveDb();
}

// Public Endpoint: Check eligibility status
app.get("/api/claim-check", (req, res) => {
  const ip = getClientIp(req);
  const fingerprint = req.query.fingerprint as string;

  if (!fingerprint) {
    res.status(400).json({ error: "Client fingerprint is required." });
    return;
  }

  // Check if IP or fingerprint is blocked
  if (db.blockedIps.includes(ip) || db.blockedFingerprints.includes(fingerprint)) {
    res.json({
      eligible: false,
      blocked: true,
      reason: "This IP or device has been blocked by an administrator.",
    });
    return;
  }

  // Find existing claim by IP or fingerprint
  const existingClaim = db.claims.find(
    (c) => c.ipAddress === ip || c.deviceFingerprint === fingerprint
  );

  if (existingClaim) {
    res.json({
      eligible: false,
      blocked: false,
      existing: true,
      claim: existingClaim,
      reason: "You have already claimed a free server from this device or IP.",
    });
    return;
  }

  res.json({ eligible: true, blocked: false });
});

// Public Endpoint: Generate free server code
app.post("/api/claim-code", (req, res) => {
  const ip = getClientIp(req);
  
  if (isRateLimited(ip)) {
    res.status(429).json({ error: "Too many claim attempts. Please wait a minute and try again." });
    return;
  }

  const { name, email, discordId, fingerprint } = req.body;

  if (!name || !email || !discordId || !fingerprint) {
    res.status(400).json({ error: "All profile fields are required." });
    return;
  }

  // Double check blockers
  if (db.blockedIps.includes(ip) || db.blockedFingerprints.includes(fingerprint)) {
    res.status(403).json({ error: "Access denied. Your IP or device is marked as blocked." });
    return;
  }

  // Double check existing claim
  const existingClaim = db.claims.find(
    (c) => c.ipAddress === ip || c.deviceFingerprint === fingerprint
  );

  if (existingClaim) {
    res.status(400).json({
      error: "Duplicate claim detected: device or network IP has already requested a server.",
      claim: existingClaim,
    });
    return;
  }

  // Generate 8-digit secure numeric code
  let isUnique = false;
  let code = "";
  let safetyCounter = 0;
  while (!isUnique && safetyCounter < 1000) {
    safetyCounter++;
    code = Math.floor(10000000 + Math.random() * 90000000).toString();
    const match = db.claims.find((c) => c.code === code);
    if (!match) {
      isUnique = true;
    }
  }

  const newClaim: ClaimRequest = {
    id: "CLM_" + Math.random().toString(36).substring(2, 11).toUpperCase(),
    name: name.trim().substring(0, 50),
    email: email.trim().substring(0, 100),
    discordId: discordId.trim().substring(0, 50),
    code,
    ipAddress: ip,
    deviceFingerprint: fingerprint,
    status: ClaimStatus.PENDING,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.claims.unshift(newClaim);
  saveDb();

  res.status(201).json({ success: true, claim: newClaim });
});

// Admin Authorization Middleware (In-memory simple session token checking)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "hdxteam123";
const activeAdminSessions = new Set<string>();

function isAdmin(req: express.Request): boolean {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "").trim();
  return activeAdminSessions.has(token);
}

// Admin API: Login
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (username === "hdxteam2026" && password === ADMIN_PASSWORD) {
    const token = "ADM_SESS_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    activeAdminSessions.add(token);
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: "Invalid admin username or password." });
  }
});

// Admin API: Logout
app.post("/api/admin/logout", (req, res) => {
  const authHeader = req.headers["authorization"];
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "").trim();
    activeAdminSessions.delete(token);
  }
  res.json({ success: true });
});

// Check auth helper
app.get("/api/admin/verify", (req, res) => {
  if (isAdmin(req)) {
    res.json({ authenticated: true });
  } else {
    res.status(401).json({ authenticated: false });
  }
});

// Admin API: Get Statistics
app.get("/api/admin/stats", (req, res) => {
  if (!isAdmin(req)) {
    res.status(401).json({ error: "Unauthorized access" });
    return;
  }

  const counts = {
    totalClaims: db.claims.length,
    pending: db.claims.filter((c) => c.status === ClaimStatus.PENDING).length,
    approved: db.claims.filter((c) => c.status === ClaimStatus.APPROVED).length,
    rejected: db.claims.filter((c) => c.status === ClaimStatus.REJECTED).length,
    used: db.claims.filter((c) => c.status === ClaimStatus.USED).length,
    blockedIps: db.blockedIps.length,
    blockedFingerprints: db.blockedFingerprints.length,
  };

  res.json(counts);
});

// Admin API: List Claim Requests with filters
app.get("/api/admin/claims", (req, res) => {
  if (!isAdmin(req)) {
    res.status(401).json({ error: "Unauthorized access" });
    return;
  }

  const { search, status } = req.query;
  let result = [...db.claims];

  if (status && status !== "all") {
    result = result.filter((c) => c.status === status);
  }

  if (search) {
    const query = (search as string).toLowerCase().trim();
    result = result.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.email.toLowerCase().includes(query) ||
        c.discordId.toLowerCase().includes(query) ||
        c.code.includes(query) ||
        c.ipAddress.includes(query)
    );
  }

  res.json(result);
});

// Admin API: Update Claim Status / Block / Delete
app.post("/api/admin/claim-action", (req, res) => {
  if (!isAdmin(req)) {
    res.status(401).json({ error: "Unauthorized access" });
    return;
  }

  const { action, claimId, blockIpValue, blockFingerprintValue } = req.body;
  const adminIp = getClientIp(req);

  // 1. Process block action
  if (action === "block-ip" && blockIpValue) {
    if (!db.blockedIps.includes(blockIpValue)) {
      db.blockedIps.push(blockIpValue);
    }
    // Set all pending/claims with this IP to rejected (or let it stay but update log)
    logAdminAction(`Blocked IPAddress: ${blockIpValue}`, "N/A", adminIp);
    saveDb();
    res.json({ success: true, message: `IP Address ${blockIpValue} has been blacklisted.` });
    return;
  }

  if (action === "block-fingerprint" && blockFingerprintValue) {
    if (!db.blockedFingerprints.includes(blockFingerprintValue)) {
      db.blockedFingerprints.push(blockFingerprintValue);
    }
    logAdminAction(`Blocked DeviceFingerprint: ${blockFingerprintValue}`, "N/A", adminIp);
    saveDb();
    res.json({ success: true, message: "Device fingerprint has been blacklisted." });
    return;
  }

  // 2. Locate target claim
  const claimIndex = db.claims.findIndex((c) => c.id === claimId);
  if (claimIndex === -1) {
    res.status(404).json({ error: "Claim not found." });
    return;
  }

  const claim = db.claims[claimIndex];

  if (action === "approve") {
    claim.status = ClaimStatus.APPROVED;
    claim.updatedAt = new Date().toISOString();
    logAdminAction("Approved Claim Request", claim.code, adminIp);
  } else if (action === "reject") {
    claim.status = ClaimStatus.REJECTED;
    claim.updatedAt = new Date().toISOString();
    logAdminAction("Rejected Claim Request", claim.code, adminIp);
  } else if (action === "mark-used") {
    claim.status = ClaimStatus.USED;
    claim.updatedAt = new Date().toISOString();
    logAdminAction("Marked Code as Used", claim.code, adminIp);
  } else if (action === "delete") {
    db.claims.splice(claimIndex, 1);
    logAdminAction("Deleted Claim Metadata Record", claim.code, adminIp);
  } else {
    res.status(400).json({ error: "Unknown action parameter" });
    return;
  }

  saveDb();
  res.json({ success: true, claim });
});

// Admin API: List Audit Logs
app.get("/api/admin/logs", (req, res) => {
  if (!isAdmin(req)) {
    res.status(401).json({ error: "Unauthorized access" });
    return;
  }
  res.json(db.logs);
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on host http://0.0.0.0:${PORT}`);
  });
}

startServer();
