import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

const routePaths = async () => {
	const { default: routes } = await import("./routes");

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
		vi.stubEnv("NODE_ENV", "production");

		const devPaths = (await routePaths()).filter((path) =>
			path.startsWith("/dev"),
		);

		expect(devPaths).toEqual([]);
	});

	test("registers the dev tools routes in development", async () => {
		vi.stubEnv("NODE_ENV", "development");

		expect(await routePaths()).toContain("/dev/scenarios");
	});
});
