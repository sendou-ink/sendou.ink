import { beforeEach, describe, expect, test, vi } from "vitest";
import { logger } from "~/utils/logger";

const AUSTIN_FEATURE = {
	geometry: { coordinates: [-97.7397, 30.2636] },
	properties: {
		name: "Austin Convention Center",
		housenumber: "500",
		street: "East Cesar Chavez Street",
		postcode: "78701",
		city: "Austin",
		state: "TX",
		country: "United States",
		countrycode: "US",
	},
};

const HELSINKI_FEATURE = {
	geometry: { coordinates: [24.9364, 60.2033] },
	properties: {
		housenumber: "1",
		street: "Messuaukio",
		postcode: "00520",
		city: "Helsinki",
		country: "Finland",
		countrycode: "FI",
	},
};

let VenueSearch: typeof import("./VenueSearch.server");
let features: unknown[];
let photonStatus: number;
const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) =>
	photonStatus === 200
		? Response.json({ type: "FeatureCollection", features })
		: new Response(null, { status: photonStatus }),
);

describe("VenueSearch.search", () => {
	beforeEach(async () => {
		// a fresh module resets the cache and the rate limit counters
		vi.resetModules();
		VenueSearch = await import("./VenueSearch.server");
		vi.stubGlobal("fetch", fetchMock);
		vi.spyOn(logger, "warn").mockImplementation(() => {});
		fetchMock.mockClear();
		features = [AUSTIN_FEATURE];
		photonStatus = 200;
	});

	test("maps a place to a result with the timezone at its coordinates", async () => {
		const results = await VenueSearch.search({
			query: "austin convention",
			userId: 1,
		});

		expect(results).toEqual([
			{
				id: expect.any(Number),
				name: "Austin Convention Center, 500 East Cesar Chavez Street, 78701 Austin, TX, United States",
				placeName: "Austin Convention Center",
				address:
					"500 East Cesar Chavez Street, 78701 Austin, TX, United States",
				city: "Austin",
				countryCode: "US",
				latitude: 30.2636,
				longitude: -97.7397,
				timezone: "America/Chicago",
			},
		]);
	});

	test("writes the house number after the street where that's the local way", async () => {
		features = [HELSINKI_FEATURE];

		const [result] = await searchResults("messuaukio");

		expect(result.address).toBe("Messuaukio 1, 00520 Helsinki, Finland");
		expect(result.placeName).toBeNull();
		expect(result.timezone).toBe("Europe/Helsinki");
	});

	test("leaves out a timezone the venue timezone select doesn't offer", async () => {
		// tz-lookup gives Etc/GMT+3 out in the Atlantic
		features = [
			{
				...AUSTIN_FEATURE,
				geometry: { coordinates: [-40, 30] },
			},
		];

		const [result] = await searchResults("ocean");

		expect(result.timezone).toBeNull();
	});

	test("skips results without a country", async () => {
		features = [
			{
				geometry: { coordinates: [0, 0] },
				properties: { name: "Null Island" },
			},
			AUSTIN_FEATURE,
		];

		const results = await searchResults("island");

		expect(results.map((result) => result.city)).toEqual(["Austin"]);
	});

	test("lists a place that is in OpenStreetMap many times over once", async () => {
		features = [AUSTIN_FEATURE, AUSTIN_FEATURE, HELSINKI_FEATURE];

		const results = await searchResults("center");

		expect(results.map((result) => result.city)).toEqual([
			"Austin",
			"Helsinki",
		]);
	});

	test("gives a place the same id in every response", async () => {
		features = [AUSTIN_FEATURE, HELSINKI_FEATURE];
		const [austin, helsinki] = await searchResults("first");
		features = [HELSINKI_FEATURE];
		const [helsinkiAgain] = await searchResults("second");

		expect(helsinkiAgain.id).toBe(helsinki.id);
		expect(austin.id).not.toBe(helsinki.id);
	});

	test("reads a city result's name as its city", async () => {
		features = [
			{
				geometry: { coordinates: [-97.7474, 30.2649] },
				properties: {
					type: "city",
					name: "Austin",
					county: "Travis",
					state: "Texas",
					country: "United States",
					countrycode: "US",
				},
			},
		];

		const [result] = await searchResults("austin");

		expect(result).toMatchObject({
			placeName: null,
			city: "Austin",
			address: "Austin, Texas, United States",
			name: "Austin, Texas, United States",
		});
	});

	test("is unavailable for a malformed response", async () => {
		features = "not a list" as never;

		expect(await VenueSearch.search({ query: "austin", userId: 1 })).toBeNull();
	});

	test("serves a repeated query from the cache, ignoring case and spacing", async () => {
		await VenueSearch.search({ query: "Austin  Convention", userId: 1 });
		const results = await VenueSearch.search({
			query: " austin convention ",
			userId: 2,
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(results).toHaveLength(1);
	});

	test("is unavailable once a user exceeds the rate limit", async () => {
		for (let i = 0; i < 30; i++) {
			await VenueSearch.search({ query: `query ${i}`, userId: 1 });
		}

		expect(
			await VenueSearch.search({ query: "one more", userId: 1 }),
		).toBeNull();
		expect(await searchResults("one more", 2)).toHaveLength(1);
	});

	test("is unavailable once Photon's request limit is reached", async () => {
		for (let i = 0; i < 60; i++) {
			await VenueSearch.search({ query: `query ${i}`, userId: i });
		}

		expect(
			await VenueSearch.search({ query: "one more", userId: 100 }),
		).toBeNull();
		expect(await searchResults("query 0", 101)).toHaveLength(1);
	});

	test("is unavailable when Photon fails", async () => {
		photonStatus = 503;

		expect(await VenueSearch.search({ query: "austin", userId: 1 })).toBeNull();
	});

	test("gives up on Photon after a timeout", async () => {
		const timeoutController = new AbortController();
		const timeoutSpy = vi
			.spyOn(AbortSignal, "timeout")
			.mockReturnValue(timeoutController.signal);
		fetchMock.mockImplementationOnce(
			(_url, init) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () =>
						reject(init.signal?.reason),
					);
				}),
		);

		const search = VenueSearch.search({ query: "slow", userId: 1 });
		timeoutController.abort(new DOMException("Timed out", "TimeoutError"));

		expect(await search).toBeNull();
		expect(timeoutSpy).toHaveBeenCalledWith(5_000);
		timeoutSpy.mockRestore();
	});

	test("doesn't query Photon for a blank query", async () => {
		expect(await VenueSearch.search({ query: "   ", userId: 1 })).toEqual([]);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

async function searchResults(query: string, userId = 1) {
	const results = await VenueSearch.search({ query, userId });
	if (!results) throw new Error("Venue search unavailable");

	return results;
}
