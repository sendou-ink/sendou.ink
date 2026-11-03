import * as R from "remeda";
import { describe, expect, test } from "vitest";
import type { SkillTierInterval } from "~/features/mmr/tiered.server";
import {
	FEED_EVENT_RETENTION_DAYS,
	SQ_SET_MILESTONES,
} from "../feed-constants";
import * as FeedEvents from "./FeedEvents";

const NOW = 1_800_000_000;
const DAY = 24 * 60 * 60;

const INTERVALS = [
	{ name: "DIAMOND", isPlus: false, neededOrdinal: 30 },
	{ name: "PLATINUM", isPlus: false, neededOrdinal: 20 },
	{ name: "GOLD", isPlus: false, neededOrdinal: 10 },
] as SkillTierInterval[];

describe("FeedEvents.derive", () => {
	test("emits a comeback after a long enough break", () => {
		const events = derive([
			sqPlay({ at: NOW - 200 * DAY }),
			sqPlay({ at: NOW }),
		]);

		expect(ofType(events, "COMEBACK")).toEqual([
			expect.objectContaining({
				at: NOW,
				data: expect.objectContaining({
					previousAt: NOW - 200 * DAY,
					setCount: 1,
				}),
			}),
		]);
	});

	test("emits a first time with the sets played since", () => {
		const events = derive([
			sqPlay({ at: NOW - 2 * DAY }),
			sqPlay({ at: NOW - DAY }),
		]);

		expect(ofType(events, "FIRST_TIME")).toEqual([
			expect.objectContaining({
				at: NOW - 2 * DAY,
				data: expect.objectContaining({ source: "SQ", setCount: 2 }),
			}),
		]);
	});

	test("keeps only the latest event of a type", () => {
		const events = derive([
			sqPlay({ at: NOW - 2 * DAY }),
			tournamentPlay({ at: NOW }),
		]);

		expect(
			ofType(events, "FIRST_TIME").map((event) => event.data.source),
		).toEqual(["TOURNAMENT"]);
	});

	test("keeps every tournament result", () => {
		const events = derive([
			tournamentPlay({ at: NOW - DAY, tournamentId: 1 }),
			tournamentPlay({ at: NOW, tournamentId: 2 }),
		]);

		expect(ofType(events, "TO_RESULT")).toHaveLength(2);
	});

	test("emits the milestone set", () => {
		const events = derive(
			R.range(0, SQ_SET_MILESTONES[0]).map((i) =>
				sqPlay({ at: NOW - SQ_SET_MILESTONES[0] + i }),
			),
		);

		expect(ofType(events, "SQ_MILESTONE")).toEqual([
			{
				type: "SQ_MILESTONE",
				at: NOW - 1,
				data: { milestone: SQ_SET_MILESTONES[0], since: NOW - 100 },
			},
		]);
	});

	test("emits the current win streak only", () => {
		const events = derive([
			sqPlay({ at: NOW - 5, isWin: true }),
			sqPlay({ at: NOW - 4, isWin: false }),
			sqPlay({ at: NOW - 3, isWin: true }),
			sqPlay({ at: NOW - 2, isWin: true }),
			sqPlay({ at: NOW - 1, isWin: true }),
		]);

		expect(ofType(events, "SQ_STREAK")).toEqual([
			{ type: "SQ_STREAK", at: NOW - 1, data: { streak: 3 } },
		]);
	});

	test("emits no streak once it's broken", () => {
		const events = derive([
			sqPlay({ at: NOW - 3, isWin: true }),
			sqPlay({ at: NOW - 2, isWin: true }),
			sqPlay({ at: NOW - 1, isWin: true }),
			sqPlay({ at: NOW, isWin: false }),
		]);

		expect(ofType(events, "SQ_STREAK")).toEqual([]);
	});

	test("emits a promotion to a tier at least as high as last season's", () => {
		const events = derive(
			[
				sqPlay({ at: NOW - 2, ordinal: 15 }),
				sqPlay({ at: NOW - 1, ordinal: 25, matchId: 2 }),
				sqPlay({ at: NOW, ordinal: 35, matchId: 3 }),
			],
			{ name: "DIAMOND", isPlus: false },
		);

		expect(ofType(events, "SQ_PROMOTION").map((e) => e.data)).toEqual([
			{
				matchId: 3,
				season: 1,
				from: { name: "PLATINUM", isPlus: false },
				to: { name: "DIAMOND", isPlus: false },
			},
		]);
	});

	test("emits an upset when beating a group enough tiers higher", () => {
		const events = derive([
			sqPlay({
				at: NOW,
				isWin: true,
				ownTier: { name: "GOLD", isPlus: false },
				opponentTier: { name: "PLATINUM", isPlus: false },
			}),
		]);

		expect(ofType(events, "SQ_UPSET")).toHaveLength(1);
	});

	test("leaves out events past their type's retention", () => {
		const oldest = NOW - FEED_EVENT_RETENTION_DAYS.TO_RESULT * DAY;
		const events = derive([
			tournamentPlay({ at: oldest - 1 }),
			tournamentPlay({ at: oldest }),
		]);

		expect(ofType(events, "TO_RESULT").map((event) => event.at)).toEqual([
			oldest,
		]);
	});
});

function derive(
	plays: FeedEvents.Play[],
	previousSeasonTier: FeedEvents.SeasonTiers["previousSeasonTier"] = null,
) {
	return FeedEvents.derive({
		plays,
		now: NOW,
		tiersOfSeason: () => ({ intervals: INTERVALS, previousSeasonTier }),
	});
}

function ofType<T extends FeedEvents.DerivedEvent["type"]>(
	events: FeedEvents.DerivedEvent[],
	type: T,
) {
	return events.filter(
		(event): event is Extract<FeedEvents.DerivedEvent, { type: T }> =>
			event.type === type,
	);
}

function sqPlay(play: Partial<FeedEvents.SqPlay>): FeedEvents.SqPlay {
	return {
		source: "SQ",
		at: NOW,
		matchId: 1,
		season: 1,
		ordinal: 0,
		isWin: true,
		ownTier: null,
		opponentTier: null,
		...play,
	};
}

function tournamentPlay(
	play: Partial<FeedEvents.TournamentPlay>,
): FeedEvents.TournamentPlay {
	return {
		source: "TOURNAMENT",
		at: NOW,
		tournamentId: 1,
		tournamentTeamId: 1,
		placement: 1,
		participantCount: 16,
		setWins: 4,
		setLosses: 0,
		name: "Tournament",
		organizationId: null,
		...play,
	};
}
