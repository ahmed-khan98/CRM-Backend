import test from "node:test";
import assert from "node:assert/strict";

/**
 * Mirrors refreshRematchBatchCounts status aggregation without Mongo.
 */
function aggregateStatuses(rows) {
  let done = 0;
  let failed = 0;
  let pending = 0;
  let processing = 0;
  let notAnalyzed = 0;
  for (const r of rows) {
    if (r.matchStatus === "done") done += 1;
    else if (r.matchStatus === "failed") failed += 1;
    else if (r.matchStatus === "pending") pending += 1;
    else if (r.matchStatus === "processing") processing += 1;
    else if (r.matchStatus === "not_analyzed") notAnalyzed += 1;
  }
  const remaining = pending + processing;
  return {
    done,
    failed,
    pending,
    processing,
    notAnalyzed,
    total: rows.length,
    status: remaining === 0 ? "done" : "running",
  };
}

test("rematch progress counts only provided application rows", () => {
  const p = aggregateStatuses([
    { matchStatus: "done" },
    { matchStatus: "done" },
    { matchStatus: "failed" },
    { matchStatus: "pending" },
    { matchStatus: "not_analyzed" },
  ]);
  assert.equal(p.total, 5);
  assert.equal(p.done, 2);
  assert.equal(p.failed, 1);
  assert.equal(p.pending, 1);
  assert.equal(p.notAnalyzed, 1);
  assert.equal(p.status, "running");
});

test("rematch progress done when none pending/processing", () => {
  const p = aggregateStatuses([
    { matchStatus: "done" },
    { matchStatus: "failed" },
    { matchStatus: "not_analyzed" },
  ]);
  assert.equal(p.status, "done");
  assert.equal(p.pending + p.processing, 0);
});
