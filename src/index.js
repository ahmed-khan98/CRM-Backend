// require('dotenv').config({path: './env'})
import dotenv from "dotenv"
import connectDB from "./db/index.js";
import {app} from './app.js'

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
.then(() => {
    app.listen(process.env.PORT , () => {
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

