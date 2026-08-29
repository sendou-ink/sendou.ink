import { subDays } from "date-fns";
import * as R from "remeda";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentOrganizationFactory from "~/db/seed/factories/TournamentOrganizationFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { cache } from "~/utils/cache.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as SeriesTeamCount from "./SeriesTeamCount.server";

const users = UserFactory.pool();
const authorId = () => users.id(1);

const SERIES_NAME = "Swim or Sink";

describe("SeriesTeamCount.lookup", () => {
	beforeEach(async () => {
		// the counts are cached for the process, but every test seeds its own
		cache.clear();
		await users.create(6);
	});

	test("raises the registered count to the median of the series' recent editions", async () => {
		const organizationId = await createOrganization();
		await createEdition({ organizationId, startedDaysAgo: 21, teamCount: 2 });
		await createEdition({ organizationId, startedDaysAgo: 14, teamCount: 6 });
		await createEdition({ organizationId, startedDaysAgo: 7, teamCount: 4 });

		const expectedTeamCount = await SeriesTeamCount.lookup();

		expect(
			expectedTeamCount({
				organizationId,
				name: `${SERIES_NAME} 4`,
				teamCount: 1,
			}),
		).toBe(4);
	});

	test("keeps the registered count when it is already above the series median", async () => {
		const organizationId = await createOrganization();
		await createEdition({ organizationId, startedDaysAgo: 7, teamCount: 2 });

		const expectedTeamCount = await SeriesTeamCount.lookup();

		expect(
			expectedTeamCount({
				organizationId,
				name: `${SERIES_NAME} 2`,
				teamCount: 5,
			}),
		).toBe(5);
	});

	test("counts only the latest editions of the series", async () => {
		const organizationId = await createOrganization();
		await createEdition({ organizationId, startedDaysAgo: 28, teamCount: 6 });
		await createEdition({ organizationId, startedDaysAgo: 21, teamCount: 6 });
		await createEdition({ organizationId, startedDaysAgo: 14, teamCount: 1 });
		await createEdition({ organizationId, startedDaysAgo: 7, teamCount: 1 });

		const expectedTeamCount = await SeriesTeamCount.lookup();

		expect(
			expectedTeamCount({
				organizationId,
				name: `${SERIES_NAME} 5`,
				teamCount: 0,
			}),
		).toBe(1);
	});

	test("ignores editions that have not started yet", async () => {
		const organizationId = await createOrganization();
		await createEdition({ organizationId, startedDaysAgo: 7, teamCount: 2 });
		await createEdition({ organizationId, startedDaysAgo: -7, teamCount: 6 });

		const expectedTeamCount = await SeriesTeamCount.lookup();

		expect(
			expectedTeamCount({
				organizationId,
				name: `${SERIES_NAME} 3`,
				teamCount: 0,
			}),
		).toBe(2);
	});

	test("ignores the organization's tournaments outside the series", async () => {
		const organizationId = await createOrganization();
		await createEdition({ organizationId, startedDaysAgo: 7, teamCount: 2 });
		await createEdition({
			organizationId,
			name: "One off invitational",
			startedDaysAgo: 5,
			teamCount: 6,
		});

		const expectedTeamCount = await SeriesTeamCount.lookup();

		expect(
			expectedTeamCount({
				organizationId,
				name: `${SERIES_NAME} 3`,
				teamCount: 0,
			}),
		).toBe(2);
	});

	test("returns the registered count for a tournament of no organization", async () => {
		const organizationId = await createOrganization();
		await createEdition({ organizationId, startedDaysAgo: 7, teamCount: 6 });

		const expectedTeamCount = await SeriesTeamCount.lookup();

		expect(
			expectedTeamCount({
				organizationId: null,
				name: `${SERIES_NAME} 2`,
				teamCount: 1,
			}),
		).toBe(1);
	});

	test("returns the registered count when the series has no edition yet", async () => {
		const organizationId = await createOrganization();

		const expectedTeamCount = await SeriesTeamCount.lookup();

		expect(
			expectedTeamCount({
				organizationId,
				name: `${SERIES_NAME} 1`,
				teamCount: 1,
			}),
		).toBe(1);
	});
});

async function createOrganization() {
	const organization = await TournamentOrganizationFactory.create(
		{ ownerId: authorId() },
		{
			series: [
				{ name: SERIES_NAME, description: null, showLeaderboard: false },
			],
		},
	);

	return organization.id;
}

async function createEdition({
	organizationId,
	name = SERIES_NAME,
	startedDaysAgo,
	teamCount,
}: {
	organizationId: number;
	name?: string;
	startedDaysAgo: number;
	teamCount: number;
}) {
	const tournament = await TournamentFactory.create({
		authorId: authorId(),
		name,
		organizationId,
		startTimes: [dateToDatabaseTimestamp(subDays(new Date(), startedDaysAgo))],
	});

	for (const idx of R.range(0, teamCount)) {
		await TournamentTeamFactory.create({
			tournamentId: tournament.id,
			memberUserIds: [users.id(idx + 1)],
		});
	}
}
