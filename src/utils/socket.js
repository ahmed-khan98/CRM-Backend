import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { Employee } from "../models/employee.model.js";
import { getAllowedOrigins, isOriginAllowed } from "./corsOrigins.js";

let io = null;

const userRoom = (userId) => `user:${userId}`;

/**
 * Attach Socket.IO to an HTTP server. Call once after createServer.
 */
export const initSocket = (httpServer) => {
  const allowedOrigins = getAllowedOrigins();

  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isOriginAllowed(origin)) return callback(null, true);
        return callback(new Error(`Not allowed by Socket CORS: ${origin}`));
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
    // Railway / reverse proxies: start with polling, then upgrade to websocket
    transports: ["polling", "websocket"],
    allowUpgrades: true,
    path: "/socket.io",
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token ||
        socket.handshake.headers?.authorization?.replace("Bearer ", "");

      if (!token || typeof token !== "string") {
        return next(new Error("Unauthorized"));
      }

      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      const user = await Employee.findById(decoded?._id).select("_id fullName");

      if (!user) {
        return next(new Error("Unauthorized"));
      }

      socket.userId = user._id.toString();
      next();
    } catch (err) {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(userRoom(socket.userId));
    console.log(
      `[socket] connected user=${socket.userId} id=${socket.id} transport=${socket.conn?.transport?.name}`
    );

    socket.on("disconnect", (reason) => {
      console.log(`[socket] disconnected user=${socket.userId} reason=${reason}`);
    });
  });

  console.log("Socket.IO initialized. Allowed origins:", allowedOrigins.join(", "));
  return io;
};

export const getIO = () => io;

/** Emit a payload to a specific user's private room */
export const emitToUser = (userId, event, payload) => {
  if (!io || !userId) {
    console.warn(`[socket] emit skipped (io=${!!io}, userId=${userId}) event=${event}`);
    return;
  }
  io.to(userRoom(userId.toString())).emit(event, payload);
};

/** Emit the same payload to many users */
export const emitToUsers = (userIds = [], event, payload) => {
  if (!io || !userIds?.length) return;
  const unique = [...new Set(userIds.map((id) => id?.toString()).filter(Boolean))];
  unique.forEach((userId) => emitToUser(userId, event, payload));
};
