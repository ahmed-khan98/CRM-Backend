// require('dotenv').config({path: './env'})
import dotenv from "dotenv"
import http from "http"
import connectDB from "./db/index.js";
import {app} from './app.js'
import { initSocket } from "./utils/socket.js"
import { startLeadScheduleReminderCron } from "./utils/leadScheduleCron.js"

dotenv.config({
    path: './.env'
})


// UNHANDLED ERRORS KO CATCH KARNE KE LIYE
process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL UNHANDLED REJECTION:', reason.message || reason);
  // process.exit(1); // Isse hata dein taaki server na ruke
});

process.on('uncaughtException', (err) => {
  console.error('CRITICAL UNCAUGHT EXCEPTION:', err.message);
  // process.exit(1);
});


connectDB()
.then(async () => {
    try {
      const { ensureRecruitmentCvDir } = await import("./utils/recruitmentCvStore.js");
      const cvDir = ensureRecruitmentCvDir();
      console.log(`Recruitment CV storage: ${cvDir}`);
    } catch (e) {
      console.error("Recruitment CV storage:", e?.message || e);
      throw e;
    }
    try {
      const { ensureRecruitmentDefaults } = await import("./utils/recruitmentHelpers.js");
      await ensureRecruitmentDefaults();
    } catch (e) {
      console.error("Recruitment defaults:", e?.message || e);
    }
    try {
      const { startMatchQueueWorker } = await import(
        "./services/ai/matching/queue.js"
      );
      startMatchQueueWorker();
    } catch (e) {
      console.error("Match queue worker:", e?.message || e);
    }
    const server = http.createServer(app);
    initSocket(server);
    startLeadScheduleReminderCron();

    server.listen(process.env.PORT , () => {
        console.log(`⚙️ Server is running at port :${process.env.PORT}`);
    })
})
.catch((err) => {
    console.log("MONGO db connection failed !!! ", err);
})

app.get('/',(req,res)=>{
    console.log('--- RAILWAY HEALTH CHECK HIT SUCCESSFULLY ---');
    res.send('server running — OK')
})
