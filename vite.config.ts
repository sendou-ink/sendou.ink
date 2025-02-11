import { vitePlugin as remix } from "@remix-run/dev";
import { installGlobals } from "@remix-run/node";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults } from "vitest/config";

installGlobals();

export default defineConfig(() => {
	return {
		ssr: {
			noExternal: ["react-charts", "react-use"],
		},
		plugins: [
			remix({
				ignoredRouteFiles: ["**/.*", "**/*.json", "**/components/*"],
				serverModuleFormat: "esm",
				future: {
					v3_fetcherPersist: true,
					v3_relativeSplatPath: true,
					v3_throwAbortReason: true,
					v3_routeConfig: true,
				},
			}),
			tsconfigPaths(),
		],
		test: {
			exclude: [...configDefaults.exclude, "e2e/**"],
			fakeTimers: {
				// todo: why is the any needed here, can it be removed after Vite 6?
				toFake: ["Date", "setTimeout", "clearTimeout"] as any,
			},
		},
		build: {
			// this is mostly done so that i18n jsons as defined in ./app/modules/i18n/loader.ts
			// do not end up in the js bundle as minimized strings
			// if we decide later that this is a useful optimization in some cases then we can
			// switch the value to a callback one that checks the file path
			assetsInlineLimit: 0,
		},
	};
});
