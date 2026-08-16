export const IS_E2E_TEST_RUN =
	(typeof import.meta.env !== "undefined" &&
		import.meta.env.VITE_E2E_TEST_RUN === "true") ||
	(typeof process !== "undefined" && process.env.VITE_E2E_TEST_RUN === "true");
