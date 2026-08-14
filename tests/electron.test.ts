import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import http from "node:http";

const require = createRequire(import.meta.url);
const { getFreePort, waitForHealth } = require("../../electron/server-host.cjs");

test("getFreePort returns a port we can actually bind", async () => {
  const port = await getFreePort();
  assert.equal(typeof port, "number");
  assert.ok(port > 0 && port < 65536);
  await new Promise<void>((resolve, reject) => {
    const srv = http.createServer((_req, res) => res.end("ok"));
    srv.on("error", reject);
    srv.listen(port, "127.0.0.1", () => srv.close(() => resolve()));
  });
});

test("waitForHealth resolves when the endpoint responds", async () => {
  const port = await getFreePort();
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  try {
    const ok = await waitForHealth(`http://127.0.0.1:${port}/health`, 3000);
    assert.equal(ok, true);
  } finally {
    server.close();
  }
});

test("waitForHealth rejects when nothing listens", async () => {
  const port = await getFreePort();
  await assert.rejects(waitForHealth(`http://127.0.0.1:${port}/health`, 1500));
});
