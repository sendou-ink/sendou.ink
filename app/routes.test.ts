import { afterEach, describe, expect, test } from "bun:test";
import type routeConfig from "./routes";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
	process.env.NODE_ENV = originalNodeEnv;
});

const routePaths = async (nodeEnv: string) => {
	process.env.NODE_ENV = nodeEnv;
	// the query makes it a fresh module instance, evaluated under this NODE_ENV
	const specifier = `./routes?${nodeEnv}`;
	const { default: routes } = (await import(specifier)) as {
		default: typeof routeConfig;
	};

	const paths: string[] = [];
	const collect = (
		entries: Array<{ path?: string; children?: unknown[] }>,
		parent: string,
	) => {
		for (const entry of entries) {
			const path = entry.path
				? `${parent}/${entry.path}`.replace(/\/+/g, "/")
				: parent;
			paths.push(path);
			collect((entry.children ?? []) as typeof entries, path);
		}
	};
	collect(routes, "");

	return paths;
};

describe("routes", () => {
	test("registers no dev tools route outside development", async () => {
		const devPaths = (await routePaths("production")).filter((path) =>
			path.startsWith("/dev"),
		);

		expect(devPaths).toEqual([]);
	});

	test("registers the dev tools routes in development", async () => {
		expect(await routePaths("development")).toContain("/dev/scenarios");
	});
});
