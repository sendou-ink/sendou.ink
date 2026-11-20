import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { logger } from "~/utils/logger";
import { wrappedLoader } from "~/utils/Test";
import { CALENDAR_VENUE_SEARCH_ROUTE } from "~/utils/urls";
import { venueSearchSearchParams } from "../calendar-search-params";
import { loader } from "./calendar.venue-search";

const venueSearchLoader = wrappedLoader<Awaited<ReturnType<typeof loader>>>({
	loader,
});

const PHOTON_RESPONSE = {
	type: "FeatureCollection",
	features: [
		{
			geometry: { coordinates: [-97.7397, 30.2636] },
			properties: {
				name: "Austin Convention Center",
				city: "Austin",
				country: "United States",
				countrycode: "US",
			},
		},
	],
};

const users = UserFactory.pool();

const tournamentAdderId = () => users.id(1);
const authorId = () => users.id(2);
const otherUserId = () => users.id(3);

const fetchMock = vi.fn(async () => Response.json(PHOTON_RESPONSE));

let queryCount = 0;
// a fresh query each search, so none is served from the previous test's cache
const search = ({
	user,
	tournamentId = null,
}: {
	user: number;
	tournamentId?: number | null;
}) =>
	venueSearchLoader({
		user,
		url: venueSearchSearchParams.href(CALENDAR_VENUE_SEARCH_ROUTE, {
			q: `austin ${++queryCount}`,
			tournamentId,
		}),
	});

describe("venue search loader", () => {
	beforeEach(async () => {
		await users.create(3);
		await UserFactory.grant(tournamentAdderId(), { patronTier: 2 });
		vi.stubGlobal("fetch", fetchMock);
		vi.spyOn(logger, "warn").mockImplementation(() => {});
		fetchMock.mockClear();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test("searches for a user who can add tournaments", async () => {
		const data = await search({ user: tournamentAdderId() });

		expect(data.results.map((result) => result.city)).toEqual(["Austin"]);
		expect(data.isUnavailable).toBe(false);
	});

	test("doesn't search for a user who can't add tournaments", async () => {
		const data = await search({ user: otherUserId() });

		expect(data.results).toEqual([]);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("searches for the author editing their tournament without the right to add new ones", async () => {
		const tournament = await TournamentFactory.create({ authorId: authorId() });

		const data = await search({
			user: authorId(),
			tournamentId: tournament.id,
		});

		expect(data.results).toHaveLength(1);
	});

	test("doesn't search for a user editing someone else's tournament", async () => {
		const tournament = await TournamentFactory.create({ authorId: authorId() });

		const data = await search({
			user: otherUserId(),
			tournamentId: tournament.id,
		});

		expect(data.results).toEqual([]);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("tells the search is unavailable when Photon fails", async () => {
		fetchMock.mockImplementationOnce(
			async () => new Response(null, { status: 503 }),
		);

		const data = await search({ user: tournamentAdderId() });

		expect(data.isUnavailable).toBe(true);
	});
});
