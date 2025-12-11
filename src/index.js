// require('dotenv').config({path: './env'})
import dotenv from "dotenv";
import connectDB from "./db/index.js";
import { app } from "./app.js";

dotenv.config({
  path: "./.env",
});
const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;

app.get("/", (req, res) => {
  console.log("--- RAILWAY HEALTH CHECK HIT SUCCESSFULLY ---");
  res.send("server running — OK");
});

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(
        "MongoDB connected !! DB HOST:",
        process.env.MONGODB_URI || "unknown"
      );
      console.log(`⚙️ Server is running at port : ${PORT}`);
    });
  })
  .catch((err) => {
    console.log("MONGO db connection failed !!! ", err);
  });

// UNHANDLED ERRORS KO CATCH KARNE KE LIYE
process.on("unhandledRejection", (reason, promise) => {
  console.error("CRITICAL UNHANDLED REJECTION:", reason.message || reason);
  // process.exit(1); // Isse hata dein taaki server na ruke
});

process.on("uncaughtException", (err) => {
  console.error("CRITICAL UNCAUGHT EXCEPTION:", err.message);
  // process.exit(1);
});

// "dev": "node -r @babel/register src/index.js",

/*
import express from "express"
const app = express()
( async () => {
    try {
        await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
        app.on("errror", (error) => {
            console.log("ERRR: ", error);
            throw error
        })

        app.listen(process.env.PORT, () => {
            console.log(`App is listening on port ${process.env.PORT}`);
        })

    } catch (error) {
        console.error("ERROR: ", error)
        throw err
    }
})()

*/
