/**
 * `import.meta.env` is undefined when Playwright bundles test code; there the flag comes from
 * `process.env` (set by playwright.config.ts) since app modules run in the test process too.
 */
export const IS_E2E_TEST_RUN =
	(typeof import.meta.env !== "undefined" &&
		import.meta.env.VITE_E2E_TEST_RUN === "true") ||
	(typeof process !== "undefined" && process.env.VITE_E2E_TEST_RUN === "true");
