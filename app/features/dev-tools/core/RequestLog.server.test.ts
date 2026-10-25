import { beforeEach, describe, expect, test } from "vitest";
import { db } from "~/db/sql";
import * as RequestLog from "./RequestLog.server";

const selectUsers = () => db.selectFrom("User").select("User.id").execute();

const trackGet = (path: string, handle: () => Promise<unknown>) =>
	RequestLog.track(
		new Request(`http://localhost${path}`, {
			headers: { Accept: "text/html" },
		}),
		async () => {
			await handle();
			return new Response(null, { status: 200 });
		},
	);

describe("RequestLog.track", () => {
	beforeEach(() => {
		RequestLog.clear();
	});

	test("records the queries made while handling the request", async () => {
		await trackGet("/builds", async () => {
			await selectUsers();
			await selectUsers();
		});

		const [request] = RequestLog.recent();
		expect(request).toMatchObject({
			method: "GET",
			path: "/builds",
			kind: "document",
			status: 200,
		});
		expect(request.queries).toHaveLength(2);
	});

	test("leaves out queries made outside of a tracked request", async () => {
		await trackGet("/builds", async () => {});
		await selectUsers();

		expect(RequestLog.recent()[0].queries).toHaveLength(0);
	});

	test.each([
		{ path: "/dev/requests", why: "dev tools" },
		{ path: "/sse", why: "event stream" },
	])("does not track $why", async ({ path }) => {
		await trackGet(path, selectUsers);

		expect(RequestLog.recent()).toHaveLength(0);
	});

	test("strips the single fetch suffix and routes param from the path", async () => {
		await RequestLog.track(
			new Request("http://localhost/q/looking.data?_routes=root&tab=a"),
			async () => new Response(null),
		);

		expect(RequestLog.recent()[0]).toMatchObject({
			path: "/q/looking?tab=a",
			kind: "data",
		});
	});
});

describe("RequestLog.repeatedQueries", () => {
	const query = (sql: string) => ({
		sql,
		parameters: [],
		durationMs: 1,
		error: null,
	});

	test("lists statements run at least three times, most repeated first", () => {
		expect(
			RequestLog.repeatedQueries({
				queries: [
					query("a"),
					query("b"),
					query("a"),
					query("b"),
					query("a"),
					query("b"),
					query("b"),
					query("c"),
				],
			}),
		).toEqual([
			{ sql: "b", count: 4 },
			{ sql: "a", count: 3 },
		]);
	});
});
