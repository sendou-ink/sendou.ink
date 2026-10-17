import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { mockFetch } from "~/utils/test-helpers";
import { fetchWithTimeout } from "./fetch";
import { logger } from "./logger";

const fetchMock = vi.fn(
	(_input: RequestInfo | URL, init?: RequestInit) =>
		new Promise<Response>((resolve, reject) => {
			init?.signal?.addEventListener("abort", () =>
				reject(init.signal?.reason),
			);
			setTimeout(() => resolve(new Response("ok")), 1000);
		}),
);

describe("fetchWithTimeout", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mockFetch(fetchMock);
		vi.spyOn(logger, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	test("aborts with a TimeoutError once the timeout elapses", async () => {
		const promise = fetchWithTimeout("https://example.com", undefined, 100);
		vi.advanceTimersByTime(100);

		await expect(promise).rejects.toMatchObject({ name: "TimeoutError" });
		expect(logger.error).toHaveBeenCalledWith("Fetch timed out");
	});

	test("still times out when the caller passes their own signal", async () => {
		const promise = fetchWithTimeout(
			"https://example.com",
			{ signal: new AbortController().signal },
			100,
		);
		vi.advanceTimersByTime(100);

		await expect(promise).rejects.toMatchObject({ name: "TimeoutError" });
	});

	test("caller abort rejects without logging a timeout", async () => {
		const controller = new AbortController();
		const promise = fetchWithTimeout(
			"https://example.com",
			{ signal: controller.signal },
			100,
		);
		controller.abort();

		await expect(promise).rejects.toMatchObject({ name: "AbortError" });
		vi.advanceTimersByTime(200);
		expect(logger.error).not.toHaveBeenCalled();
	});

	test("failed fetch does not log a timeout later", async () => {
		fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
		const promise = fetchWithTimeout("https://example.com", undefined, 100);

		await expect(promise).rejects.toThrow("fetch failed");
		vi.advanceTimersByTime(200);
		expect(logger.error).not.toHaveBeenCalled();
	});

	test("resolves with the response when it arrives in time", async () => {
		const promise = fetchWithTimeout("https://example.com", undefined, 5000);
		vi.advanceTimersByTime(1000);

		await expect(promise).resolves.toBeInstanceOf(Response);
		expect(logger.error).not.toHaveBeenCalled();
	});
});
