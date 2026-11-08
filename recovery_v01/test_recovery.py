import unittest
import time
from recovery import RecoveryLedger

class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.ledger = RecoveryLedger()
        self.pid = self.ledger.create("key-1", "merchant-A", 5000, "USD")
    def test_idempotency(self):
        self.assertEqual(self.pid, self.ledger.create("key-1", "merchant-A", 5000, "USD"))
        with self.assertRaises(ValueError):
            self.ledger.create("key-1", "merchant-B", 5000, "USD")
    def test_unverified_approval_denied(self):
        with self.assertRaises(PermissionError):
            self.ledger.approve(self.pid, "approval", int(time.time())+60)
    def test_stall_and_reconcile(self):
        self.ledger.approve(self.pid, "approval", int(time.time())+60, verified=True)
        self.ledger.claim_submission(self.pid)
        self.ledger.uncertain(self.pid)
        with self.assertRaises(PermissionError):
            self.ledger.claim_submission(self.pid)
        with self.assertRaises(PermissionError):
            self.ledger.reconcile(self.pid, "SUCCEEDED")
        self.ledger.reconcile(self.pid, "SUCCEEDED", "provider-1", provider_verified=True)
        self.assertEqual(self.ledger.state(self.pid), "SUCCEEDED")
        with self.assertRaises(ValueError):
            self.ledger.reconcile(self.pid, "FAILED", "provider-1", provider_verified=True)
    def test_approval_replay_denied(self):
        self.ledger.approve(self.pid, "approval", int(time.time())+60, verified=True)
        with self.assertRaises(ValueError):
            self.ledger.approve(self.pid, "another", int(time.time())+60, verified=True)
    def test_expired_approval(self):
        with self.assertRaises(PermissionError):
            self.ledger.approve(self.pid, "approval", int(time.time())-1, verified=True)

if __name__ == "__main__":
    unittest.main()
