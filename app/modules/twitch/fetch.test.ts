import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { twitchFetch } from "./fetch";

vi.mock("./token", () => ({
	getToken: async () => "token",
	purgeCachedToken: () => {},
}));

vi.mock("./utils.server", () => ({
	getTwitchEnvVars: () => ({ TWITCH_CLIENT_ID: "client-id" }),
}));

const URL = "https://api.twitch.tv/helix/videos?id=1";

const fetchMock = vi.fn<typeof fetch>();

describe("twitchFetch", () => {
	beforeEach(() => {
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test("returns a 404 response with allowNotFound", async () => {
		fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

		const res = await twitchFetch(URL, { allowNotFound: true });

		expect(res.status).toBe(404);
	});

	test("throws on a 404 without allowNotFound", async () => {
		fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

		await expect(twitchFetch(URL)).rejects.toThrow("404");
	});

	test("throws on a 429 with failOnRateLimit without waiting or retrying", async () => {
		fetchMock.mockResolvedValue(rateLimitedResponse());

		await expect(twitchFetch(URL, { failOnRateLimit: true })).rejects.toThrow(
			"rate limited",
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test("keeps failOnRateLimit on the retry after a 401", async () => {
		fetchMock
			.mockResolvedValueOnce(new Response(null, { status: 401 }))
			.mockResolvedValueOnce(rateLimitedResponse());

		await expect(twitchFetch(URL, { failOnRateLimit: true })).rejects.toThrow(
			"rate limited",
		);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	test("retries a 429 once the rate limit resets without failOnRateLimit", async () => {
		fetchMock
			.mockResolvedValueOnce(rateLimitedResponse())
			.mockResolvedValueOnce(new Response("{}"));

		const res = await twitchFetch(URL);

		expect(res.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});

function rateLimitedResponse() {
	return new Response(null, {
		status: 429,
		headers: { "Ratelimit-Reset": String(Math.floor(Date.now() / 1000)) },
	});
}
