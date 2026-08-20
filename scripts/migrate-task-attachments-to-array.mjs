// One-time migration: creatorAttachment / assigneeAttachment used to be a
// single embedded object per task; the schema now stores an array (tasks
// can have several attachments). This converts existing documents in-place
// so old data keeps working under the new array schema.
//
// Usage (from CMS_BACKEND root):
//   node scripts/migrate-task-attachments-to-array.mjs
//
// Safe to re-run — already-array fields are left untouched.

import "dotenv/config";
import mongoose from "mongoose";

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not set in .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  const tasks = mongoose.connection.db.collection("tasks");
  const cursor = tasks.find({});

  let scanned = 0;
  let updated = 0;

  for await (const doc of cursor) {
    scanned++;
    const update = {};

    for (const field of ["creatorAttachment", "assigneeAttachment"]) {
      const value = doc[field];
      if (Array.isArray(value)) continue; // already migrated
      if (value && typeof value === "object" && value.url) {
        // Single attachment object → wrap in a 1-item array, default
        // resourceType to "raw" for pre-existing rows that predate that field.
        update[field] = [{ ...value, resourceType: value.resourceType || "raw" }];
      } else {
        // null / undefined / empty → empty array
        update[field] = [];
      }
    }

    if (Object.keys(update).length) {
      await tasks.updateOne({ _id: doc._id }, { $set: update });
      updated++;
    }
  }

  console.log(`Scanned ${scanned} tasks, migrated ${updated}.`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
