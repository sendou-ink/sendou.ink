import {
	MODULE_MOCKING_TEST_FILES,
	unitProjectConfig,
} from "./vitest.unit.config.ts";

export default unitProjectConfig({
	name: "unit-isolated",
	include: MODULE_MOCKING_TEST_FILES,
	exclude: [],
	isolate: true,
});
