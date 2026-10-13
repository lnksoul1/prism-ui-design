/**
 * Package root of the Prism design bundle.
 *
 * The real Host half lives in `./host-entry.mjs`; this file only re-exports it so
 * the package root stays importable. See `host-entry.mjs` for why the patch
 * names the `./host` subpath.
 */

export { Config, apply } from "./host-entry.mjs";
