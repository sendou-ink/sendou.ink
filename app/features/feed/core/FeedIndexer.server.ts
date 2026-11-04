import { setImmediate } from "node:timers/promises";
import * as R from "remeda";
import { userSkills } from "~/features/mmr/tiered.server";
import { databaseTimestampNow } from "~/utils/dates";
import * as FeedEventRepository from "../FeedEventRepository.server";
import * as FeedRepository from "../FeedRepository.server";
import {
	FEED_EVENT_MAX_RETENTION_DAYS,
	FEED_EVENT_RETENTION_DAYS,
} from "../feed-constants";
import * as FeedEvents from "./FeedEvents";

const DAY = 24 * 60 * 60;

let isRunning = false;

/**
 * Re-derives the feed events of everyone who finished a SendouQ set or a tournament since the last run
 * and drops the events past retention. The first run indexes everyone who played within retention.
 * Yields to the event loop between users so a big backlog doesn't stall requests.
 */
export async function run() {
	if (isRunning) return { userCount: 0 };
	isRunning = true;

	try {
		const now = databaseTimestampNow();
		const since = now - FEED_EVENT_MAX_RETENTION_DAYS * DAY;

		const sqCursor =
			(await FeedEventRepository.findCursorBySource("SQ")) ?? since;
		const matchPlayers =
			await FeedEventRepository.findUserIdsOfMatchesConfirmedSince(sqCursor);

		const tournamentCursor =
			await FeedEventRepository.findCursorBySource("TOURNAMENT");
		const latestTournamentResultRowId =
			await FeedEventRepository.findLatestTournamentResultRowId();
		const tournamentPlayers =
			tournamentCursor === undefined
				? await FeedEventRepository.findUserIdsOfTournamentsStartedSince(since)
				: await FeedEventRepository.findUserIdsOfTournamentResultsAfterRowId(
						tournamentCursor,
					);

		const userIds = R.unique([
			...matchPlayers.map((row) => row.userId),
			...tournamentPlayers.map((row) => row.userId),
		]);
		for (const userId of userIds) {
			await reindexUser({ userId, now });
			await setImmediate();
		}

		await FeedEventRepository.upsertCursor({
			source: "SQ",
			position:
				R.firstBy(matchPlayers, [(row) => row.confirmedAt, "desc"])
					?.confirmedAt ?? sqCursor,
		});
		await FeedEventRepository.upsertCursor({
			source: "TOURNAMENT",
			position: latestTournamentResultRowId,
		});
		for (const [type, days] of R.entries(FEED_EVENT_RETENTION_DAYS)) {
			await FeedEventRepository.deleteAllOfTypeBefore({
				type,
				before: now - days * DAY,
			});
		}

		return { userCount: userIds.length };
	} finally {
		isRunning = false;
	}
}

async function reindexUser({ userId, now }: { userId: number; now: number }) {
	const since = now - FEED_EVENT_MAX_RETENTION_DAYS * DAY;
	const sqPlays: FeedEvents.SqPlay[] = (
		await FeedEventRepository.findAllSqPlaysByUserId(userId)
	).map((row) => ({
		source: "SQ",
		at: row.at,
		matchId: row.matchId,
		season: row.season,
		ordinal: row.ordinal,
		previousOrdinal: row.previousOrdinal,
		isWin: row.mapWins > row.mapsPlayed - row.mapWins,
		ownTier: row.ownTierName
			? { name: row.ownTierName, isPlus: Boolean(row.ownTierIsPlus) }
			: null,
		opponentTier: row.opponentTierName
			? { name: row.opponentTierName, isPlus: Boolean(row.opponentTierIsPlus) }
			: null,
	}));
	const tournamentPlays: FeedEvents.TournamentPlay[] = (
		await FeedEventRepository.findAllTournamentPlaysByUserId(userId)
	).map((row) => ({
		source: "TOURNAMENT",
		at: row.at,
		tournamentId: row.tournamentId,
		tournamentTeamId: row.tournamentTeamId,
		placement: row.placement,
		participantCount: row.participantCount,
		setWins: row.setResults.filter((set) => set === "W").length,
		setLosses: row.setResults.filter((set) => set === "L").length,
		name: row.name,
		organizationId: row.organizationId,
	}));

	const tiersBySeason = new Map<number, FeedEvents.SeasonTiers>();
	for (const season of R.unique(
		sqPlays.filter((play) => play.at >= since).map((play) => play.season),
	)) {
		const previous =
			season > 0
				? (await userSkills(season - 1)).userSkills[userId]
				: undefined;

		tiersBySeason.set(season, {
			intervals: (await userSkills(season)).intervals,
			previousSeasonTier:
				previous && !previous.approximate
					? { name: previous.tier.name, isPlus: previous.tier.isPlus }
					: null,
		});
	}

	const events: FeedEvents.DerivedEvent[] = FeedEvents.derive({
		plays: [...sqPlays, ...tournamentPlays],
		now,
		tiersOfSeason: (season) => tiersBySeason.get(season),
	});
	for (const season of tiersBySeason.keys()) {
		const rivalry = await FeedRepository.findTopCloseRivalryOfUsers({
			userIds: [userId],
			season,
		});
		if (!rivalry) continue;

		events.push({
			type: "SQ_RIVALRY",
			at: R.firstBy(
				sqPlays.filter((play) => play.season === season),
				[(play) => play.at, "desc"],
			)!.at,
			data: { season, ...R.omit(rivalry, ["ownerUserId"]) },
		});
	}

	await FeedEventRepository.replaceAllByUserId({ userId, events });
}
