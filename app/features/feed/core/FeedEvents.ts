import * as R from "remeda";
import type { SkillTierInterval } from "~/features/mmr/tiered.server";
import {
	FEED_COMEBACK_MIN_BREAK_DAYS,
	FEED_EVENT_MAX_RETENTION_DAYS,
	FEED_EVENT_RETENTION_DAYS,
	FEED_SQ_UPSET_MIN_TIER_STEPS,
	SQ_SET_MILESTONES,
} from "../feed-constants";
import type {
	FeedEventDataByType,
	FeedEventType,
	FeedTier,
} from "../feed-types";

const DAY = 24 * 60 * 60;
const MIN_STREAK = 3;
const TIER_ORDER = [
	"IRON",
	"BRONZE",
	"SILVER",
	"GOLD",
	"PLATINUM",
	"DIAMOND",
	"LEVIATHAN",
];

export interface SqPlay {
	source: "SQ";
	at: number;
	matchId: number;
	season: number;
	ordinal: number;
	isWin: boolean;
	ownTier: FeedTier | null;
	opponentTier: FeedTier | null;
}

export interface TournamentPlay {
	source: "TOURNAMENT";
	at: number;
	tournamentId: number;
	tournamentTeamId: number;
	placement: number;
	participantCount: number;
	setWins: number;
	setLosses: number;
	name: string;
	organizationId: number | null;
}

export type Play = SqPlay | TournamentPlay;

export type DerivedEvent = {
	[T in FeedEventType]: { type: T; at: number; data: FeedEventDataByType[T] };
}[FeedEventType];

export interface SeasonTiers {
	intervals: SkillTierInterval[];
	/** The user's tier the season before, promotions below it aren't notable */
	previousSeasonTier: FeedTier | null;
}

/**
 * The feed events of one user's whole play history (SendouQ sets and tournaments) within each type's retention.
 * Of every type but tournament results only the latest is kept, the only one a feed item shows.
 * The history must be complete since comebacks, first times, milestones and streaks look at the plays before.
 */
export function derive({
	plays,
	now,
	tiersOfSeason,
}: {
	plays: Play[];
	now: number;
	tiersOfSeason: (season: number) => SeasonTiers | undefined;
}): DerivedEvent[] {
	const since = now - FEED_EVENT_MAX_RETENTION_DAYS * DAY;
	const sorted = R.sortBy(plays, (play) => play.at);
	const sqPlays = sorted.filter((play): play is SqPlay => play.source === "SQ");
	const events: DerivedEvent[] = [];

	const firstIndexOfSource = new Map<Play["source"], number>();
	for (const [index, play] of sorted.entries()) {
		if (!firstIndexOfSource.has(play.source)) {
			firstIndexOfSource.set(play.source, index);
		}
	}

	for (const [index, play] of sorted.entries()) {
		if (play.at < since) continue;

		const countFromHere = (source: Play["source"]) =>
			sorted.slice(index).filter((p) => p.source === source).length;
		const tournamentId =
			play.source === "TOURNAMENT" ? play.tournamentId : null;
		const previous = sorted[index - 1];

		if (
			previous &&
			play.at - previous.at >= FEED_COMEBACK_MIN_BREAK_DAYS * DAY
		) {
			events.push({
				type: "COMEBACK",
				at: play.at,
				data: {
					source: play.source,
					tournamentId,
					previousAt: previous.at,
					setCount: countFromHere("SQ"),
					tournamentCount: countFromHere("TOURNAMENT"),
				},
			});
		}

		if (firstIndexOfSource.get(play.source) === index) {
			events.push({
				type: "FIRST_TIME",
				at: play.at,
				data: {
					source: play.source,
					tournamentId,
					placement: play.source === "TOURNAMENT" ? play.placement : null,
					participantCount:
						play.source === "TOURNAMENT" ? play.participantCount : null,
					setCount: countFromHere("SQ"),
				},
			});
		}

		if (play.source === "TOURNAMENT") {
			events.push({
				type: "TO_RESULT",
				at: play.at,
				data: R.pick(play, [
					"tournamentId",
					"tournamentTeamId",
					"placement",
					"participantCount",
					"setWins",
					"setLosses",
					"name",
					"organizationId",
				]),
			});
		}
	}

	let previousOfSeason: SqPlay | undefined;
	for (const [index, play] of sqPlays.entries()) {
		const previous =
			previousOfSeason?.season === play.season ? previousOfSeason : undefined;
		previousOfSeason = play;
		if (play.at < since) continue;

		const milestone = SQ_SET_MILESTONES.find((m) => m === index + 1);
		if (milestone) {
			events.push({
				type: "SQ_MILESTONE",
				at: play.at,
				data: { milestone, since: sqPlays[0].at },
			});
		}

		const tiers = tiersOfSeason(play.season);
		if (previous && tiers) {
			const from = tierOf(tiers.intervals, previous.ordinal);
			const to = tierOf(tiers.intervals, play.ordinal);
			const isNotable =
				!tiers.previousSeasonTier ||
				tierRank(to) >= tierRank(tiers.previousSeasonTier);

			if (tierRank(to) > tierRank(from) && isNotable) {
				events.push({
					type: "SQ_PROMOTION",
					at: play.at,
					data: { matchId: play.matchId, season: play.season, from, to },
				});
			}
		}

		if (
			play.isWin &&
			play.ownTier &&
			play.opponentTier &&
			tierRank(play.opponentTier) - tierRank(play.ownTier) >=
				FEED_SQ_UPSET_MIN_TIER_STEPS
		) {
			events.push({
				type: "SQ_UPSET",
				at: play.at,
				data: { matchId: play.matchId },
			});
		}
	}

	const latestLossIndex = sqPlays.findLastIndex((play) => !play.isWin);
	const streak = sqPlays.length - 1 - latestLossIndex;
	const latest = sqPlays.at(-1);
	if (streak >= MIN_STREAK && latest && latest.at >= since) {
		events.push({ type: "SQ_STREAK", at: latest.at, data: { streak } });
	}

	const kept = events.filter(
		(event) => event.at >= now - FEED_EVENT_RETENTION_DAYS[event.type] * DAY,
	);

	return [
		...kept.filter((event) => event.type === "TO_RESULT"),
		...Object.values(
			R.groupBy(
				kept.filter((event) => event.type !== "TO_RESULT"),
				(event) => event.type,
			),
		).map((ofType) => R.firstBy(ofType, [(event) => event.at, "desc"])!),
	];
}

function tierOf(intervals: SkillTierInterval[], ordinal: number): FeedTier {
	const interval = intervals.find((t) => t.neededOrdinal! <= ordinal);

	return interval
		? { name: interval.name, isPlus: interval.isPlus }
		: { name: "IRON", isPlus: false };
}

/** Position on the ladder where each plus tier is its own step, e.g. Diamond+ is one above Diamond. */
export function tierRank(tier: { name: string; isPlus: boolean }) {
	return TIER_ORDER.indexOf(tier.name) * 2 + (tier.isPlus ? 1 : 0);
}
