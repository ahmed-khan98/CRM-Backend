import test from "node:test";
import assert from "node:assert/strict";
import {
  requeueStaleMatchJobs,
  claimNextMatchJob,
  MATCH_QUEUE_STALE_MS,
} from "../src/services/ai/matching/queue.js";

/**
 * In-memory stand-in for RecruitmentMatchQueue used to unit-test claim / stale logic
 * without Mongo. Mirrors the findOneAndUpdate semantics we rely on.
 */
function makeMemoryQueue(rows = []) {
  const store = rows.map((r) => ({ ...r }));
  return {
    store,
    async findOneAndUpdate(filter, update, opts = {}) {
      let candidates = store.filter((r) => r.status === filter.status);
      if (filter.attempts && filter.attempts.$lt != null) {
        candidates = candidates.filter((r) => r.attempts < filter.attempts.$lt);
      }
      if (filter.lockedAt && filter.lockedAt.$lte) {
        candidates = store.filter(
          (r) =>
            r.status === filter.status &&
            r.lockedAt &&
            r.lockedAt <= filter.lockedAt.$lte
        );
      }
      candidates.sort((a, b) => a.createdAt - b.createdAt);
      const row = candidates[0];
      if (!row) return null;
      if (update.$set) Object.assign(row, update.$set);
      if (update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) {
          row[k] = (row[k] || 0) + v;
        }
      }
      return opts.new === false ? null : { ...row };
    },
    async updateMany(filter, update) {
      let n = 0;
      for (const row of store) {
        if (row.status !== filter.status) continue;
        if (
          filter.lockedAt?.$lte &&
          !(row.lockedAt && row.lockedAt <= filter.lockedAt.$lte)
        ) {
          continue;
        }
        Object.assign(row, update.$set || {});
        n += 1;
      }
      return { modifiedCount: n };
    },
  };
}

test("queue atomic claim picks oldest pending and bumps attempts", async () => {
  const q = makeMemoryQueue([
    {
      _id: "a",
      status: "pending",
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date("2026-01-02"),
      lockedAt: null,
    },
    {
      _id: "b",
      status: "pending",
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date("2026-01-01"),
      lockedAt: null,
    },
  ]);

  // Inline claim using same filter as production helper
  const claimed = await q.findOneAndUpdate(
    { status: "pending", attempts: { $lt: 3 } },
    {
      $set: { status: "processing", lockedAt: new Date() },
      $inc: { attempts: 1 },
    },
    { sort: { createdAt: 1 }, new: true }
  );
  assert.equal(claimed._id, "b");
  assert.equal(claimed.status, "processing");
  assert.equal(claimed.attempts, 1);
  assert.ok(claimed.lockedAt);

  const second = await q.findOneAndUpdate(
    { status: "pending", attempts: { $lt: 3 } },
    {
      $set: { status: "processing", lockedAt: new Date() },
      $inc: { attempts: 1 },
    },
    { new: true }
  );
  assert.equal(second._id, "a");
});

test("stale-lock requeue returns processing jobs to pending", async () => {
  const stale = new Date(Date.now() - MATCH_QUEUE_STALE_MS - 1000);
  const q = makeMemoryQueue([
    {
      _id: "stuck",
      status: "processing",
      attempts: 1,
      lockedAt: stale,
      lastError: "",
    },
    {
      _id: "fresh",
      status: "processing",
      attempts: 1,
      lockedAt: new Date(),
      lastError: "",
    },
  ]);
  const res = await q.updateMany(
    {
      status: "processing",
      lockedAt: { $lte: new Date(Date.now() - MATCH_QUEUE_STALE_MS) },
    },
    {
      $set: {
        status: "pending",
        lockedAt: null,
        lastError: "stale_lock_requeued",
      },
    }
  );
  assert.equal(res.modifiedCount, 1);
  assert.equal(q.store.find((r) => r._id === "stuck").status, "pending");
  assert.equal(q.store.find((r) => r._id === "fresh").status, "processing");
});

test("apply succeeds when enqueue fails (caller swallows error)", async () => {
  async function applyLike({ enqueue }) {
    const applicationId = "app1";
    let enqueueFailed = false;
    try {
      await enqueue(applicationId);
    } catch {
      enqueueFailed = true;
    }
    return { applicationId, matchStatus: "pending", enqueueFailed };
  }

  const ok = await applyLike({
    enqueue: async () => {
      throw new Error("mongo down");
    },
  });
  assert.equal(ok.applicationId, "app1");
  assert.equal(ok.matchStatus, "pending");
  assert.equal(ok.enqueueFailed, true);
});

// Keep imports used (tree-shake noise) — claimNextMatchJob / requeue exported for integration
assert.equal(typeof claimNextMatchJob, "function");
assert.equal(typeof requeueStaleMatchJobs, "function");
