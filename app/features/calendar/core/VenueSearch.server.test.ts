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
const fetchMock = vi.fn(async () =>
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
				id: 0,
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

		const [result] = await VenueSearch.search({
			query: "messuaukio",
			userId: 1,
		});

		expect(result.address).toBe("Messuaukio 1, 00520 Helsinki, Finland");
		expect(result.placeName).toBeNull();
		expect(result.timezone).toBe("Europe/Helsinki");
	});

	test("skips results without a country", async () => {
		features = [
			{
				geometry: { coordinates: [0, 0] },
				properties: { name: "Null Island" },
			},
			AUSTIN_FEATURE,
		];

		const results = await VenueSearch.search({ query: "island", userId: 1 });

		expect(results.map((result) => result.city)).toEqual(["Austin"]);
	});

	test("lists a place that is in OpenStreetMap many times over once", async () => {
		features = [AUSTIN_FEATURE, AUSTIN_FEATURE, HELSINKI_FEATURE];

		const results = await VenueSearch.search({ query: "center", userId: 1 });

		expect(results.map((result) => [result.id, result.city])).toEqual([
			[0, "Austin"],
			[1, "Helsinki"],
		]);
	});

	test("returns no results for a malformed response", async () => {
		features = "not a list" as never;

		expect(await VenueSearch.search({ query: "austin", userId: 1 })).toEqual(
			[],
		);
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

	test("returns no results once a user exceeds the rate limit", async () => {
		for (let i = 0; i < 30; i++) {
			await VenueSearch.search({ query: `query ${i}`, userId: 1 });
		}

		expect(await VenueSearch.search({ query: "one more", userId: 1 })).toEqual(
			[],
		);
		expect(
			await VenueSearch.search({ query: "one more", userId: 2 }),
		).toHaveLength(1);
	});

	test("returns no results when Photon fails", async () => {
		photonStatus = 503;

		expect(await VenueSearch.search({ query: "austin", userId: 1 })).toEqual(
			[],
		);
	});

	test("doesn't query Photon for a blank query", async () => {
		expect(await VenueSearch.search({ query: "   ", userId: 1 })).toEqual([]);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
