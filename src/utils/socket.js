import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { Employee } from "../models/employee.model.js";

let io = null;

const userRoom = (userId) => `user:${userId}`;

/**
 * Attach Socket.IO to an HTTP server. Call once after createServer.
 */
export const initSocket = (httpServer) => {
  const allowedOrigins = [
    "https://www.zytronworld.online",
    "http://localhost:3000",
    "https://crm-virid-nine-17.vercel.app",
    "https://customer-payment-link.vercel.app",
  ];

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
      methods: ["GET", "POST"],
    },
    path: "/socket.io",
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace("Bearer ", "");

      if (!token) {
        return next(new Error("Unauthorized"));
      }

      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      const user = await Employee.findById(decoded?._id).select("_id fullName");

      if (!user) {
        return next(new Error("Unauthorized"));
      }

      socket.userId = user._id.toString();
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(userRoom(socket.userId));

    socket.on("disconnect", () => {
      // room leave is automatic
    });
  });

  console.log("Socket.IO initialized");
  return io;
};

export const getIO = () => io;

/** Emit a payload to a specific user's private room */
export const emitToUser = (userId, event, payload) => {
  if (!io || !userId) return;
  io.to(userRoom(userId.toString())).emit(event, payload);
};

/** Emit the same payload to many users */
export const emitToUsers = (userIds = [], event, payload) => {
  if (!io || !userIds?.length) return;
  const unique = [...new Set(userIds.map((id) => id?.toString()).filter(Boolean))];
  unique.forEach((userId) => emitToUser(userId, event, payload));
};
