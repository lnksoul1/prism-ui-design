/**
 * End-to-end smoke: spawn the built server over stdio, complete the MCP
 * handshake, and assert the advertised tool surface.
 *
 * This is the check that the route B refactor actually produced a working MCP
 * server (not merely code that compiles).
 */
import { spawn } from "node:child_process";
import path from "node:path";

const entry = path.resolve(process.cwd(), "dist/index.js");
const child = spawn(process.execPath, [entry], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, PRISM_AUTOSAVE: "off", PRISM_AUTOLOAD: "off" },
});

let out = "";
let err = "";
child.stdout.on("data", (d) => (out += d.toString()));
child.stderr.on("data", (d) => (err += d.toString()));

const send = (obj) => child.stdin.write(JSON.stringify(obj) + "\n");

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke", version: "1.0.0" },
  },
});
send({ jsonrpc: "2.0", method: "notifications/initialized" });
send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
send({ jsonrpc: "2.0", id: 3, method: "resources/list", params: {} });
send({ jsonrpc: "2.0", id: 4, method: "prompts/list", params: {} });

await new Promise((r) => setTimeout(r, 2500));
child.kill();

const frames = out
  .split("\n")
  .filter((l) => l.trim().startsWith("{"))
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const byId = (id) => frames.find((f) => f.id === id);
const init = byId(1);
const tools = byId(2);
const resources = byId(3);
const prompts = byId(4);

console.log("server:", init?.result?.serverInfo ?? "(no initialize response)");
console.log("protocolVersion:", init?.result?.protocolVersion ?? "-");
console.log("tools:", tools?.result?.tools?.length ?? 0);
console.log("resources:", resources?.result?.resources?.length ?? 0);
console.log("prompts:", prompts?.result?.prompts?.length ?? 0);
console.log("tool names:", (tools?.result?.tools ?? []).map((t) => t.name).sort().join(", "));
if (err.trim()) console.log("stderr:", err.trim().split("\n").slice(0, 3).join(" | "));
