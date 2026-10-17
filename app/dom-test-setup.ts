import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { plugin } from "bun";

// Vitest browser mode's default viewport, which the tests were written against
GlobalRegistrator.register({
	url: "http://localhost:5173",
	width: 414,
	height: 896,
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// class names as written, so tests can tell elements apart by the classes they get
plugin({
	name: "css-modules",
	setup(build) {
		build.onLoad({ filter: /\.module\.css$/ }, () => ({
			contents:
				"export default new Proxy({}, { get: (_, name) => typeof name === 'string' ? name : undefined });",
			loader: "js",
		}));
	},
});

// after registering, @testing-library binds `screen` to the document on import
await import("./dom-test-matchers");
