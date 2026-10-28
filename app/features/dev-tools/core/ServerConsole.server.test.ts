/** biome-ignore-all lint/suspicious/noConsole: logs to the console under test */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as RequestLog from "./RequestLog.server";
import * as ServerConsole from "./ServerConsole.server";

const originalError = console.error;
const originalWarn = console.warn;
const errorSpy = vi.fn();

describe("ServerConsole.install", () => {
	beforeEach(() => {
		errorSpy.mockClear();
		console.error = errorSpy;
		console.warn = vi.fn();
		ServerConsole.install();
	});

	afterEach(() => {
		console.error = originalError;
		console.warn = originalWarn;
		globalThis.__devToolsServerConsole = undefined;
	});

	test("records console errors and warnings, newest first", () => {
		console.error("first");
		console.warn("second");

		expect(ServerConsole.recent()).toMatchObject([
			{ level: "warn", message: "second", path: null },
			{ level: "error", message: "first", path: null },
		]);
	});

	test("still logs to the original console", () => {
		console.error("boom");

		expect(errorSpy).toHaveBeenCalledWith("boom");
	});

	test("counts a repeated message once", () => {
		console.error("boom");
		console.error("boom");

		expect(ServerConsole.recent()).toMatchObject([
			{ message: "boom", count: 2 },
		]);
	});

	test("strips terminal colors", () => {
		console.error("\u001b[31mred\u001b[39m");

		expect(ServerConsole.recent()[0].message).toBe("red");
	});

	test("skips browser errors Vite forwards to the terminal", () => {
		console.error(
			"9:49:11 AM [vite] (client) [Unhandled error] Error: Thrown in the browser",
		);

		expect(ServerConsole.recent()).toEqual([]);
	});

	test("attaches the request being handled", async () => {
		await RequestLog.track(new Request("http://localhost/builds"), async () => {
			console.error("in a loader");
			return new Response(null);
		});

		expect(ServerConsole.recent()[0].path).toBe("GET /builds");
	});

	test("patches the console once when installed again", () => {
		ServerConsole.install();
		console.error("boom");

		expect(ServerConsole.recent()).toMatchObject([{ count: 1 }]);
	});

	test("attaches the request it is told about", () => {
		ServerConsole.withRequest(
			new Request("http://localhost/to/1.data?_routes=root"),
			() => console.error("in handleError"),
		);

		expect(ServerConsole.recent()[0].path).toBe("GET /to/1");
	});
});
