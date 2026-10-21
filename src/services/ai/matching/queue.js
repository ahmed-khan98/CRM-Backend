import mongoose from "mongoose";
import { RecruitmentMatchQueue } from "../../../models/recruitment/recruitmentMatchQueue.model.js";
import { Application } from "../../../models/recruitment/index.js";
import { runMatchForApplication } from "./runMatch.js";

export const MATCH_QUEUE_STALE_MS = 5 * 60 * 1000;
export const MATCH_QUEUE_INTERVAL_MS = 15 * 1000;
export const MATCH_QUEUE_BATCH = 3;

/**
 * Enqueue a match job. Idempotent: reuses pending row for same application.
 * Never throws to callers when used from apply — wrap if needed.
 */
export async function enqueueMatchJob(applicationId, { force = false } = {}) {
  if (!applicationId || !mongoose.Types.ObjectId.isValid(String(applicationId))) {
    const err = new Error("Invalid applicationId");
    err.code = "INVALID_APPLICATION_ID";
    throw err;
  }

  await Application.updateOne(
    { _id: applicationId, isDeleted: false },
    {
      $set: {
        matchStatus: "pending",
        matchStatusReason: "",
        ...(force ? {} : { matchPercent: null }),
      },
    }
  );

  const existing = await RecruitmentMatchQueue.findOne({
    applicationId,
    status: { $in: ["pending", "processing"] },
  });
  if (existing) {
    if (force) {
      existing.force = true;
      existing.status = "pending";
      existing.lockedAt = null;
      existing.lastError = "";
      await existing.save();
    }
    return existing;
  }

  return RecruitmentMatchQueue.create({
    applicationId,
    status: "pending",
    attempts: 0,
    maxAttempts: 3,
    force: Boolean(force),
  });
}

/**
 * Requeue jobs stuck in processing past the timeout.
 */
export async function requeueStaleMatchJobs(
  staleMs = MATCH_QUEUE_STALE_MS,
  now = new Date()
) {
  const cutoff = new Date(now.getTime() - staleMs);
  const res = await RecruitmentMatchQueue.updateMany(
    {
      status: "processing",
      lockedAt: { $lte: cutoff },
    },
    {
      $set: {
        status: "pending",
        lockedAt: null,
        lastError: "stale_lock_requeued",
      },
    }
  );
  return res.modifiedCount || 0;
}

/**
 * Atomically claim the next pending job.
 */
export async function claimNextMatchJob(now = new Date(), maxAttempts = 3) {
  return RecruitmentMatchQueue.findOneAndUpdate(
    {
      status: "pending",
      attempts: { $lt: maxAttempts },
    },
    {
      $set: { status: "processing", lockedAt: now },
      $inc: { attempts: 1 },
    },
    { sort: { createdAt: 1 }, new: true }
  );
}

export async function processClaimedMatchJob(row, deps = {}) {
  if (!row) return null;
  try {
    const result = await runMatchForApplication(row.applicationId, {
      force: Boolean(row.force),
      ...deps,
    });
    row.status = "done";
    row.processedAt = new Date();
    row.lastError = result?.reason && !result.ok ? String(result.reason) : "";
    row.lockedAt = null;
    await row.save();
    return result;
  } catch (err) {
    const attempts = row.attempts || 0;
    const max = row.maxAttempts || 3;
    row.lastError = String(err?.code || err?.message || "failed").slice(0, 300);
    row.lockedAt = null;
    if (attempts >= max) {
      row.status = "failed";
      row.processedAt = new Date();
      await Application.updateOne(
        { _id: row.applicationId },
        {
          $set: {
            matchStatus: "failed",
            matchStatusReason: row.lastError,
          },
        }
      );
    } else {
      row.status = "pending";
    }
    await row.save();
    return { ok: false, error: row.lastError };
  }
}

export async function drainMatchQueue({
  limit = MATCH_QUEUE_BATCH,
  staleMs = MATCH_QUEUE_STALE_MS,
  ...deps
} = {}) {
  await requeueStaleMatchJobs(staleMs);
  const results = [];
  for (let i = 0; i < limit; i += 1) {
    const row = await claimNextMatchJob();
    if (!row) break;
    results.push(await processClaimedMatchJob(row, deps));
  }
  return results;
}

let intervalHandle = null;
let draining = false;

export function startMatchQueueWorker(
  intervalMs = MATCH_QUEUE_INTERVAL_MS
) {
  if (intervalHandle) return intervalHandle;
  const tick = async () => {
    if (draining) return;
    draining = true;
    try {
      await drainMatchQueue();
    } catch (err) {
      console.error("[match-queue]", err?.message || err);
    } finally {
      draining = false;
    }
  };
  console.log(
    `[match-queue] started (every ${Math.round(intervalMs / 1000)}s)`
  );
  tick();
  intervalHandle = setInterval(tick, intervalMs);
  return intervalHandle;
}
