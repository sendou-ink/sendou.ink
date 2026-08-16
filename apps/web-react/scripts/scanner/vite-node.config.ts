/**
 * Config for running the scanner scripts with vite-node. Deliberately minimal:
 * the root vite.config.ts pre-bundles @techstark/opencv-js for the browser
 * worker, and vite-node would resolve that browser prebundle (which
 * crashes on __dirname in Node). Without the include, vite-node
 * externalizes the dep to a plain require of the (patched) CJS bundle.
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
