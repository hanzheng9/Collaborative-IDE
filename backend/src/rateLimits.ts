import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import type { Server, Socket } from "socket.io";
import { logger } from "./logger.js";

export type FixedWindowRateLimiterOptions = {
  max: number;
  windowMs: number;
};

type WindowEntry = {
  count: number;
  resetAt: number;
};

export class FixedWindowRateLimiter {
  private readonly attempts = new Map<string, WindowEntry>();

  constructor(private readonly options: FixedWindowRateLimiterOptions) {}

  isAllowed(key: string, now = Date.now()) {
    this.cleanup(now);

    const current = this.attempts.get(key);

    if (!current || current.resetAt <= now) {
      this.attempts.set(key, {
        count: 1,
        resetAt: now + this.options.windowMs
      });
      return true;
    }

    if (current.count >= this.options.max) {
      return false;
    }

    current.count += 1;
    return true;
  }

  cleanup(now = Date.now()) {
    for (const [key, entry] of this.attempts) {
      if (entry.resetAt <= now) {
        this.attempts.delete(key);
      }
    }
  }

  size() {
    return this.attempts.size;
  }
}

export function getRequestIp(request: Request) {
  return request.ip || request.socket.remoteAddress || "unknown";
}

export function getSocketIp(socket: Socket) {
  const forwardedFor = socket.handshake.headers["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(",")[0];

  return (
    forwardedIp?.trim() ||
    socket.handshake.address ||
    socket.conn.remoteAddress ||
    "unknown"
  );
}

export function createHttpRateLimiter(options: {
  max: number;
  message: string;
  windowMs: number;
}) {
  return rateLimit({
    handler(request: Request, response: Response) {
      logger.warn("HTTP rate limit exceeded", {
        ip: getRequestIp(request),
        path: request.path
      });
      response.status(429).json({ error: options.message });
    },
    legacyHeaders: false,
    max: options.max,
    standardHeaders: true,
    windowMs: options.windowMs
  });
}

export function applySocketConnectionRateLimit(
  io: Server,
  limiter: FixedWindowRateLimiter
) {
  io.use((socket, next) => {
    const ip = getSocketIp(socket);

    if (!limiter.isAllowed(ip)) {
      logger.warn("Socket.io connection rate limit exceeded", {
        ip,
        socketId: socket.id
      });
      next(new Error("Too many Socket.io connection attempts. Try again shortly."));
      return;
    }

    next();
  });
}
