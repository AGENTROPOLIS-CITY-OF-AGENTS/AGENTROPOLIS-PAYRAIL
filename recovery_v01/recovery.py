"""PAYRAIL54 recovery reference engine. Simulation only; no live payment credentials."""
import sqlite3
import json
import time
import uuid

STATES = {"CREATED", "AUTHORIZED", "SUBMITTING", "PENDING_RECONCILIATION", "SUCCEEDED", "FAILED", "CANCELLED"}
FINAL = {"SUCCEEDED", "FAILED", "CANCELLED"}

class RecoveryLedger:
    def __init__(self, path=":memory:"):
        self.db = sqlite3.connect(path, isolation_level=None)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("""CREATE TABLE IF NOT EXISTS payments(
            id TEXT PRIMARY KEY, idem TEXT UNIQUE NOT NULL, merchant TEXT NOT NULL,
            amount_minor INTEGER NOT NULL CHECK(amount_minor>0), currency TEXT NOT NULL,
            state TEXT NOT NULL, provider_ref TEXT UNIQUE, approval_id TEXT UNIQUE,
            approval_expiry INTEGER, updated INTEGER NOT NULL)""")
        self.db.execute("""CREATE TABLE IF NOT EXISTS events(
            event_id TEXT PRIMARY KEY, payment_id TEXT NOT NULL, kind TEXT NOT NULL,
            data TEXT NOT NULL, created INTEGER NOT NULL)""")

    def _event(self, payment_id, kind, data=None):
        self.db.execute("INSERT INTO events VALUES(?,?,?,?,?)",
                        (str(uuid.uuid4()), payment_id, kind, json.dumps(data or {}, sort_keys=True), int(time.time())))

    def create(self, idem, merchant, amount_minor, currency):
        if not idem or not merchant or not currency or amount_minor <= 0:
            raise ValueError("invalid payment intent")
        self.db.execute("BEGIN IMMEDIATE")
        try:
            existing = self.db.execute("SELECT id,merchant,amount_minor,currency FROM payments WHERE idem=?", (idem,)).fetchone()
            if existing:
                if existing[1:] != (merchant, amount_minor, currency):
                    raise ValueError("idempotency key reused for different intent")
                self.db.execute("COMMIT")
                return existing[0]
            pid = str(uuid.uuid4())
            self.db.execute("INSERT INTO payments VALUES(?,?,?,?,?,'CREATED',NULL,NULL,NULL,?)",
                            (pid, idem, merchant, amount_minor, currency, int(time.time())))
            self._event(pid, "CREATED")
            self.db.execute("COMMIT")
            return pid
        except Exception:
            self.db.execute("ROLLBACK")
            raise

    def state(self, pid):
        row = self.db.execute("SELECT state FROM payments WHERE id=?", (pid,)).fetchone()
        if row is None:
            raise KeyError(pid)
        return row[0]

    def approve(self, pid, approval_id, expires_at, verified=False):
        # 'verified' must be set ONLY by an external CIP54 signature/intent verifier.
        if not verified or expires_at <= int(time.time()):
            raise PermissionError("missing verified, unexpired approval")
        self.db.execute("BEGIN IMMEDIATE")
        try:
            if self.state(pid) != "CREATED":
                raise ValueError("approval requires CREATED")
            self.db.execute("UPDATE payments SET state='AUTHORIZED',approval_id=?,approval_expiry=?,updated=? WHERE id=?",
                            (approval_id, expires_at, int(time.time()), pid))
            self._event(pid, "AUTHORIZED", {"approval_id": approval_id})
            self.db.execute("COMMIT")
        except Exception:
            self.db.execute("ROLLBACK")
            raise

    def claim_submission(self, pid):
        self.db.execute("BEGIN IMMEDIATE")
        try:
            row = self.db.execute("SELECT state,approval_expiry FROM payments WHERE id=?", (pid,)).fetchone()
            if not row or row[0] != "AUTHORIZED" or row[1] <= int(time.time()):
                raise PermissionError("not authorized for submission")
            self.db.execute("UPDATE payments SET state='SUBMITTING',updated=? WHERE id=?", (int(time.time()), pid))
            self._event(pid, "SUBMITTING")
            self.db.execute("COMMIT")
        except Exception:
            self.db.execute("ROLLBACK")
            raise

    def uncertain(self, pid):
        self.db.execute("BEGIN IMMEDIATE")
        try:
            if self.state(pid) != "SUBMITTING":
                raise ValueError("only submitting transactions can become uncertain")
            self.db.execute("UPDATE payments SET state='PENDING_RECONCILIATION',updated=? WHERE id=?",
                            (int(time.time()), pid))
            self._event(pid, "PENDING_RECONCILIATION")
            self.db.execute("COMMIT")
        except Exception:
            self.db.execute("ROLLBACK")
            raise

    def reconcile(self, pid, outcome, provider_ref=None, provider_verified=False):
        # Provider verification must happen outside this engine using authenticated provider API.
        if not provider_verified or outcome not in ("SUCCEEDED", "FAILED"):
            raise PermissionError("verified terminal provider outcome required")
        self.db.execute("BEGIN IMMEDIATE")
        try:
            old = self.state(pid)
            if old in FINAL:
                if old != outcome:
                    raise ValueError("conflicting terminal outcome: manual review")
                self.db.execute("COMMIT")
                return
            if old not in ("SUBMITTING", "PENDING_RECONCILIATION"):
                raise ValueError("invalid reconciliation state")
            self.db.execute("UPDATE payments SET state=?,provider_ref=?,updated=? WHERE id=?",
                            (outcome, provider_ref, int(time.time()), pid))
            self._event(pid, "PROVIDER_" + outcome, {"provider_ref": provider_ref})
            self.db.execute("COMMIT")
        except Exception:
            self.db.execute("ROLLBACK")
            raise
