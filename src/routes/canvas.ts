import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { stateStore } from "../state.js";
import { canvasToHtml, shapesToComponents } from "../canvas-shapes.js";
import { asyncHandler, HttpError } from "./shared.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(__dirname, "../../client");

// Canvas / tldraw routes
export function registerCanvasRoutes(): express.Router {
  const router = express.Router();

  // API: Get the tldraw canvas document for a page (defaults to current page)
  router.get("/api/canvas", asyncHandler(async (req, res) => {
    const state = stateStore.getState();
    const pageId =
      typeof req.query.pageId === "string" ? req.query.pageId : state.currentPageId;
    if (!pageId) {
      throw new HttpError(400, "No page id");
    }
    const doc = stateStore.getCanvasDoc(pageId);
    res.json({ success: true, page_id: pageId, doc });
  }));

  // API: Save the tldraw canvas document for a page
  router.post("/api/canvas", asyncHandler(async (req, res) => {
    const state = stateStore.getState();
    const pageId =
      typeof (req.body || {}).pageId === "string"
        ? (req.body as { pageId: string }).pageId
        : state.currentPageId;
    const doc = (req.body || {}).doc;
    if (!pageId || !doc || typeof doc !== "object") {
      throw new HttpError(400, "Missing pageId or canvas doc");
    }
    stateStore.saveCanvasDoc(pageId, doc, "user");
    res.json({ success: true, page_id: pageId, revision: stateStore.getState().revision });
  }));

  // API: Apply the current page's canvas drawing to the component model
  router.post("/api/canvas/apply", asyncHandler(async (_req, res) => {
    const state = stateStore.getState();
    const pageId = state.currentPageId;
    const doc = stateStore.getCanvasDoc(pageId);
    if (!pageId || !doc) {
      throw new HttpError(400, "No canvas document for the current page");
    }
    const components = shapesToComponents(doc);
    stateStore.replacePageComponents(pageId, components, "user");
    res.json({
      success: true,
      page_id: pageId,
      component_count: components.length,
      components,
    });
  }));

  // API: Write the canvas drawing back to a real HTML file in the client folder
  router.post("/api/canvas/export", asyncHandler(async (_req, res) => {
    const state = stateStore.getState();
    const doc = stateStore.getCanvasDoc(state.currentPageId);
    if (!doc) {
      throw new HttpError(400, "No canvas document for the current page");
    }
    const html = canvasToHtml(doc, state.tokens);
    const fs = await import("fs");
    const targetClientDir = process.env.PRISM_CLIENT_DIR || clientDir;
    const out = path.join(targetClientDir, "canvas-page.html");
    fs.writeFileSync(out, html, "utf-8");
    res.json({ success: true, file: out, size: html.length, component_count: shapesToComponents(doc).length });
  }));

  // API: Queue AI drawing commands for the current page's canvas
  router.post("/api/canvas/draw", asyncHandler(async (req, res) => {
    const state = stateStore.getState();
    const shapes = (req.body || {}).shapes;
    if (!Array.isArray(shapes) || shapes.length === 0) {
      throw new HttpError(400, "Missing shapes array");
    }
    const queued = stateStore.addCanvasDraws(shapes, state.currentPageId, "ai");
    res.json({ success: true, page_id: state.currentPageId, queued: queued.length });
  }));

  // API: Clear the applied draw queue for a page
  router.post("/api/canvas/draws/clear", asyncHandler(async (req, res) => {
    const state = stateStore.getState();
    const pageId =
      typeof (req.body || {}).pageId === "string"
        ? (req.body as { pageId: string }).pageId
        : state.currentPageId;
    const cleared = stateStore.clearCanvasDraws(pageId, "user");
    res.json({ success: true, cleared });
  }));

  return router;
}
