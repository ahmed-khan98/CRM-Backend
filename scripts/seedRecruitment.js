import "dotenv/config";
import mongoose from "mongoose";
import { ensureRecruitmentDefaults } from "../src/utils/recruitmentHelpers.js";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI missing");
  process.exit(1);
}

async function main() {
  await mongoose.connect(uri);
  await ensureRecruitmentDefaults();
  console.log("Recruitment defaults seeded (settings, email templates, offer template).");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
