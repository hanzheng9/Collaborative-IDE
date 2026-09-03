import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { io as createClient } from "socket.io-client";
import { Server } from "socket.io";
import { describe, expect, it } from "vitest";
import {
  applySocketConnectionRateLimit,
  FixedWindowRateLimiter
} from "./rateLimits.js";

function waitForEvent<T>(socket: ReturnType<typeof createClient>, event: string) {
  return new Promise<T>((resolve) => {
    socket.once(event, resolve);
  });
}

describe("FixedWindowRateLimiter", () => {
  it("allows requests up to the configured maximum", () => {
    const limiter = new FixedWindowRateLimiter({ max: 2, windowMs: 1000 });

    expect(limiter.isAllowed("127.0.0.1", 0)).toBe(true);
    expect(limiter.isAllowed("127.0.0.1", 10)).toBe(true);
    expect(limiter.isAllowed("127.0.0.1", 20)).toBe(false);
  });

  it("resets after the window expires and cleans old entries", () => {
    const limiter = new FixedWindowRateLimiter({ max: 1, windowMs: 1000 });

    expect(limiter.isAllowed("127.0.0.1", 0)).toBe(true);
    expect(limiter.isAllowed("127.0.0.1", 500)).toBe(false);
    expect(limiter.isAllowed("127.0.0.1", 1001)).toBe(true);

    limiter.cleanup(2002);

    expect(limiter.size()).toBe(0);
  });

  it("rejects excessive Socket.io connection attempts", async () => {
    const httpServer = createServer();
    const ioServer = new Server(httpServer);
    applySocketConnectionRateLimit(
      ioServer,
      new FixedWindowRateLimiter({ max: 1, windowMs: 60_000 })
    );

    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const address = httpServer.address() as AddressInfo;
    const url = `http://localhost:${address.port}`;
    const firstSocket = createClient(url, {
      forceNew: true,
      reconnection: false
    });

    await waitForEvent(firstSocket, "connect");
    const secondSocket = createClient(url, {
      forceNew: true,
      reconnection: false
    });
    await expect(waitForEvent<Error>(secondSocket, "connect_error")).resolves
      .toMatchObject({
        message: expect.stringMatching(/too many socket\.io connection/i)
      });

    firstSocket.disconnect();
    secondSocket.disconnect();
    await new Promise<void>((resolve) => ioServer.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });
});
