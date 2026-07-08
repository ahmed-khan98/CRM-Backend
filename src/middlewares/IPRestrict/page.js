import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const allowedIps = process.env.IP
  ? process.env.IP.split(",").map((i) => i.trim())
  : [];

const whitelistedEmails = [
  "ahmedkhan@pentaprime-innovations.com",
  "sarim.zia.ppi@gmail.com",
  "jasimzia@zytronworld.com"
];

export const restrictIP = asyncHandler(async (req, res, next) => {
  // 1. Bypass Payment Link
  if (req.originalUrl.includes("/paymentlink")) {
    return next(); // Return lagana zaroori hai taake niche wala code execute na ho
  }

  // 2. Extract Client IP
  let clientIP =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket.remoteAddress;

  if (clientIP === "::1") {
    clientIP = "127.0.0.1";
  }

  if (clientIP.startsWith("::ffff:")) {
    clientIP = clientIP.replace("::ffff:", "");
  }

 // 3. Extract User Email (Cookie vs Pure Header Token)
  let emailToVerify = null;

  // Pehle approach cookie se check karne ki (Normal browser k liye)
  try {
    const userCookie = req?.cookies?.currentuser || req?.cookies?.currentUser;
    if (userCookie) {
      const currentUser = typeof userCookie === "string" ? JSON.parse(userCookie) : userCookie;
      emailToVerify = currentUser?.email;
    }
  } catch (e) {
    // Cookie parsing fail ya cookie na ho toh koi masla nahi
  }

  // 🔥 CORE FIX FOR INCOGNITO: Agar cookie block ho chuki hy, toh direct frontend authorization header se token nikalo
  if (!emailToVerify) {
    try {
      const authHeader = req.header("Authorization") || req.headers["authorization"];
      
      // Strict Check: Sirf tabhi verify karein jab frontend ne header me token bheja ho
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "").trim();

        if (token) {
          // Token decode karo using secret key
          const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
          
          // Database se real-time email check kar lo
          const user = await Employee.findById(decodedToken?._id).select("email");
          if (user) {
            emailToVerify = user.email;
          }
        }
      }
    } catch (e) {
      console.error("JWT Header verification failed in restrictIP:", e.message);
    }
  }

  const sanitizedEmail = emailToVerify?.toString().toLowerCase().trim();
  const bodyEmail = req?.body?.email?.toString().toLowerCase().trim();

  console.log(`[IP RESTRICT DEBUG] Route: ${req.originalUrl} | Final Detected Email: "${sanitizedEmail}"`);

  // 4. Whitelist Email Bypass Check
  if (
    (sanitizedEmail && whitelistedEmails.includes(sanitizedEmail)) ||
    (bodyEmail && whitelistedEmails.includes(bodyEmail))
  ) {
    console.log(`[IP RESTRICT] Whitelist Bypass Granted for: ${sanitizedEmail || bodyEmail}`);
    return next();
  }
  
  // 5. IP Validation Check
  if (!allowedIps.includes(clientIP)) {
 return next(new ApiError(403, `Access Denied: IP is not authorized.`));
  }

  // 6. Final Safe Next
  return next(); 
});