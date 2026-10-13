/**
 * Host half of the Prism design bundle.
 *
 * All visitor-visible work happens in the Client half (`./client`), which renders
 * the live preview panel. This half exists so the bundle has a normal Host row
 * and so the panel's settings live in `cordis.patch.yml` like any other plugin's
 * config, which is what the user's patch layer survives upgrades.
 */

/** Row config, read by the Client half through the slot's plugin options. */
export const Config = {
  type: "object",
  properties: {
    previewPath: {
      type: "string",
      description:
        "Absolute path of the preview artifact written by the Prism `design_preview_sync` tool.",
    },
    pollIntervalMs: {
      type: "number",
      minimum: 250,
      description: "How often the panel checks the artifact for a new revision, in milliseconds.",
    },
  },
  additionalProperties: false,
};

export function apply() {
  // Intentionally empty: the panel registers through slots in the Client half.
}
