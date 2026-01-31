// import.meta.env is undefined when Playwright bundles test code,
// so we need to check if it exists before accessing it
export const IS_E2E_TEST_RUN =
	typeof import.meta.env !== "undefined" &&
	import.meta.env.VITE_E2E_TEST_RUN === "true";
