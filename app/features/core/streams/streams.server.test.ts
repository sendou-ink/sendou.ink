import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as LiveStreamFactory from "~/db/seed/factories/LiveStreamFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentMatchScheduleFactory from "~/db/seed/factories/TournamentMatchScheduleFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import type { TournamentSettings } from "~/db/tables-json";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { RunningTournaments } from "~/features/tournament-bracket/core/RunningTournaments.server";
import {
	clearAllTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import {
	getLiveTournamentStreamerTwitchNames,
	getLiveTournamentStreams,
	getUpcomingLeagueCastStreams,
} from "./streams.server";

const users = UserFactory.pool();
const organizerId = () => users.id(1);
const streamerId = () => users.id(2);
const opponentId = () => users.id(3);

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

const ROUND_ROBIN: TournamentSettings["bracketProgression"] = [
	{
		name: "Division 1",
		type: "round_robin",
		requiresCheckIn: false,
		settings: {},
	},
];

/** A started one-set league in the registry with `streamerId` streaming; the set is agreed for `scheduledAt`. */
async function runningLeagueSet({
	scheduledAt,
	castAccount,
	isPlayed = false,
}: {
	scheduledAt: number;
	castAccount?: string;
	isPlayed?: boolean;
}) {
	const league = await TournamentFactory.create(
		{
			authorId: organizerId(),
			startTimes: [dateToDatabaseTimestamp(new Date()) - 7 * DAY],
			bracketProgression: ROUND_ROBIN,
			minMembersPerTeam: 1,
		},
		{ isLeague: true, tier: 3 },
	);
	for (const userId of [streamerId(), opponentId()]) {
		await TournamentTeamFactory.create(
			{ tournamentId: league.id, memberUserIds: [userId] },
			{ isCheckedIn: true },
		);
	}
	const [match] = await TournamentFactory.startBracket(league.id);
	await TournamentMatchScheduleFactory.schedule({
		matchId: match.id,
		scheduledAt,
	});
	if (castAccount) {
		await TournamentFactory.castMatch({
			tournamentId: league.id,
			matchId: match.id,
			twitchAccount: castAccount,
		});
	}
	await LiveStreamFactory.replaceAll([
		{ userId: streamerId(), twitch: "streamer_channel" },
	]);
	await TournamentRepository.updateCastTwitchAccounts({
		tournamentId: league.id,
		castTwitchAccounts: castAccount ? [castAccount] : [],
	});
	if (isPlayed) {
		await TournamentFactory.endSets(league.id);
	}

	clearAllTournamentDataCache();
	RunningTournaments.clear();
	RunningTournaments.add(await tournamentFromDB(league.id));

	return { league, match };
}

describe("getLiveTournamentStreams", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	afterEach(() => {
		RunningTournaments.clear();
		vi.useRealTimers();
	});

	test("a league set inside its live window with a member streaming is one entry", async () => {
		const scheduledAt = databaseTimestampNow() + 10 * 60;
		const { league, match } = await runningLeagueSet({ scheduledAt });

		const streams = getLiveTournamentStreams();

		expect(streams).toHaveLength(1);
		expect(streams[0]).toMatchObject({
			id: `league-match-${match.id}`,
			url: `/to/${league.id}/matches/${match.id}`,
			startsAt: scheduledAt - 30 * 60,
			tier: 3,
		});
		expect(streams[0].subtitle).toContain("Division 1");
		expect(getLiveTournamentStreamerTwitchNames()).toEqual([
			"streamer_channel",
		]);
	});

	test("a league set outside its live window is not live even with a member streaming", async () => {
		await runningLeagueSet({ scheduledAt: databaseTimestampNow() + 2 * HOUR });

		expect(getLiveTournamentStreams()).toHaveLength(0);
		expect(getLiveTournamentStreamerTwitchNames()).toHaveLength(0);
	});
});

describe("getUpcomingLeagueCastStreams", () => {
	beforeEach(async () => {
		await users.create(3);
	});

	afterEach(() => {
		RunningTournaments.clear();
	});

	test("a set marked for cast shows as upcoming at its agreed time", async () => {
		const scheduledAt = databaseTimestampNow() + DAY;
		const { match } = await runningLeagueSet({
			scheduledAt,
			castAccount: "league_cast",
		});

		expect(getUpcomingLeagueCastStreams()).toEqual([
			expect.objectContaining({
				id: `league-match-${match.id}`,
				startsAt: scheduledAt,
			}),
		]);
	});

	test("a set nobody marked for cast is not upcoming", async () => {
		await runningLeagueSet({ scheduledAt: databaseTimestampNow() + DAY });

		expect(getUpcomingLeagueCastStreams()).toHaveLength(0);
	});

	test("a set played before its agreed time is not upcoming", async () => {
		await runningLeagueSet({
			scheduledAt: databaseTimestampNow() + DAY,
			castAccount: "league_cast",
			isPlayed: true,
		});

		expect(getUpcomingLeagueCastStreams()).toHaveLength(0);
	});

	test("a set further than three days away is not upcoming yet", async () => {
		await runningLeagueSet({
			scheduledAt: databaseTimestampNow() + 4 * DAY,
			castAccount: "league_cast",
		});

		expect(getUpcomingLeagueCastStreams()).toHaveLength(0);
	});
});
