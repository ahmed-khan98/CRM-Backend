import mongoose from "mongoose";
import dotenv from "dotenv";
import { Project } from "../src/models/project.model.js";

dotenv.config();

async function fixProjectClientIdIndex() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const collection = Project.collection;

  const indexes = await collection.indexes();
  const oldIndex = indexes.find((idx) => idx.name === "clientId_1");

  if (oldIndex) {
    await collection.dropIndex("clientId_1");
    console.log("Dropped old clientId_1 index");
  } else {
    console.log("No clientId_1 index to drop");
  }

  const unsetResult = await collection.updateMany(
    { clientId: null },
    { $unset: { clientId: "" } }
  );
  console.log(`Unset clientId on ${unsetResult.modifiedCount} project(s) with null clientId`);

  await Project.syncIndexes();
  console.log("Synced project indexes");

  const newIndexes = await collection.indexes();
  console.log(
    "Current indexes:",
    newIndexes.map((idx) => ({ name: idx.name, key: idx.key, partial: idx.partialFilterExpression }))
  );

  await mongoose.disconnect();
  console.log("Done");
}

fixProjectClientIdIndex().catch((err) => {
  console.error(err);
  process.exit(1);
});
