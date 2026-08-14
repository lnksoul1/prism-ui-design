"use strict";

/**
 * Shared helpers for the Electron desktop shell (product definition v2).
 * Kept in a separate CJS module so the port/health logic is unit-testable.
 */

const net = require("node:net");

/** Allocate a free TCP port on localhost. */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const p = addr.port;
        srv.close(() => resolve(p));
      } else {
        srv.close(() => reject(new Error("could not allocate a free port")));
      }
    });
  });
}

/** Poll a health endpoint until it responds OK or the timeout elapses. */
async function waitForHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
      lastError = new Error(`HTTP ${res.status} from ${url}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw lastError || new Error(`Server did not become healthy at ${url}`);
}

module.exports = { getFreePort, waitForHealth };
