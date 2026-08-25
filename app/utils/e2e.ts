/**
 * Whether the app is running as part of an e2e test.
 *
 * `import.meta.env` is undefined when Playwright bundles test code, so it has to be
 * checked before accessing. There the flag comes from `process.env` instead (set by
 * playwright.config.ts), as app modules run in the test process too.
 */
export const IS_E2E_TEST_RUN =
	(typeof import.meta.env !== "undefined" &&
		import.meta.env.VITE_E2E_TEST_RUN === "true") ||
	(typeof process !== "undefined" && process.env.VITE_E2E_TEST_RUN === "true");
