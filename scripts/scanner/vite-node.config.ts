/**
 * vite-node config for the scanner scripts. The root vite.config.ts
 * pre-bundles @techstark/opencv-js for the browser worker, and vite-node would
 * resolve that prebundle (which crashes on __dirname in Node); without the
 * include it externalizes the dep to a plain require of the patched CJS bundle.
 */
import { defineConfig } from "vite";

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	optimizeDeps: {
		noDiscovery: true,
		exclude: ["@techstark/opencv-js"],
	},
});
