/**
 * True only on the Vite dev server (and in unit tests). Production builds, e2e runs included, replace
 * `import.meta.env.DEV` with `false` at build time, so code behind this flag is compiled out of them.
 * `import.meta.env` is undefined when Playwright bundles test code, see `IS_E2E_TEST_RUN`.
 */
export const IS_DEV_BUILD =
	typeof import.meta.env !== "undefined" && import.meta.env.DEV === true;
