/**
 * Host entry of the Prism design bundle, imported by `cordis.patch.yml` as
 * `@local/dsh-prism-design/host`.
 *
 * All visitor-visible work happens in the Client half (`./client`), which renders
 * the live preview panel. This half exists so the bundle has a normal Host row
 * and so the panel's settings live in `cordis.patch.yml` like any other plugin's
 * config, which is what the user's patch layer survives upgrades.
 *
 * It is deliberately dependency-free: a bundle linked in from outside the
 * profile cannot resolve Harness packages (`@deepseek-ai/schemastery` and
 * friends) as bare imports, and `node_modules` is not shipped with the bundle.
 */

/** Preview artifact the Prism `design_preview_sync` tool overwrites. */
const DEFAULT_PREVIEW_PATH = "D:\\Prism\\.prism-preview\\design.html";
/** How often the panel checks the artifact for a new revision, in ms. */
const DEFAULT_POLL_INTERVAL_MS = 1500;
const MIN_POLL_INTERVAL_MS = 250;
const CONFIG_KEYS = new Set(["previewPath", "pollIntervalMs"]);

/**
 * Row config, read by the Client half through the Slot `inject` factory.
 *
 * The Loader validates a plugin's `Config` through the Standard Schema
 * interface (`Config["~standard"].validate`), so an object shaped like this is
 * all a config row needs. It is intentionally not a Schemastery schema: the
 * Loader accepts one, but it cannot be imported here (see the note above), and
 * a plain JSON Schema object is rejected outright — it has no `~standard`, so
 * the entry fails to activate with
 * "Cannot read properties of undefined (reading 'validate')".
 *
 * @see https://standardschema.dev
 */
export const Config = {
  "~standard": {
    version: 1,
    vendor: "prism-design",
    validate(config) {
      const raw = config !== null && typeof config === "object" ? config : {};
      const issues = [];

      for (const key of Object.keys(raw)) {
        if (!CONFIG_KEYS.has(key)) issues.push({ message: `unknown config key "${key}"`, path: [key] });
      }

      const value = {};

      const previewPath = raw.previewPath ?? DEFAULT_PREVIEW_PATH;
      if (typeof previewPath !== "string" || previewPath.length === 0) {
        issues.push({ message: "previewPath must be a non-empty string", path: ["previewPath"] });
      } else {
        value.previewPath = previewPath;
      }

      const pollIntervalMs = raw.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
      if (
        typeof pollIntervalMs !== "number" ||
        !Number.isFinite(pollIntervalMs) ||
        pollIntervalMs < MIN_POLL_INTERVAL_MS
      ) {
        issues.push({
          message: `pollIntervalMs must be a number >= ${MIN_POLL_INTERVAL_MS}`,
          path: ["pollIntervalMs"],
        });
      } else {
        value.pollIntervalMs = pollIntervalMs;
      }

      return issues.length > 0 ? { issues } : { value };
    },
  },
};

export function apply() {
  // Intentionally empty: the panel registers through slots in the Client half.
}
