import { isAfter, subMonths } from "date-fns";
import type { DBBoolean } from "~/db/tables";
import type { TierName } from "~/features/mmr/mmr-constants";
import { SENDOUQ_BEST_OF } from "~/features/sendouq/q-constants";
import { databaseTimestampToDate } from "~/utils/dates";

/** Each group's map win count and whether one has reached the best-of's required wins. */
export function score(match: {
	mapList: Array<{ winnerGroupId: number | null }>;
	groupAlpha: { id: number };
	groupBravo: { id: number };
}) {
	const mapsToWin = Math.ceil(SENDOUQ_BEST_OF / 2);
	const alphaWins = match.mapList.filter(
		(m) => m.winnerGroupId === match.groupAlpha.id,
	).length;
	const bravoWins = match.mapList.filter(
		(m) => m.winnerGroupId === match.groupBravo.id,
	).length;

	return {
		mapsToWin,
		alphaWins,
		bravoWins,
		isDecisive: alphaWins >= mapsToWin || bravoWins >= mapsToWin,
	};
}

/**
 * Game being played, starting from 1: the first unreported map. Once the score
 * is decisive (e.g. awaiting the other team's confirmation) it stays on the
 * set-ending game.
 */
export function currentGameNumber(match: Parameters<typeof score>[0]) {
	const reportedCount = match.mapList.filter(
		(map) => map.winnerGroupId !== null,
	).length;

	if (score(match).isDecisive) return reportedCount;

	return Math.min(reportedCount + 1, match.mapList.length);
}

/** Members of both groups of the match, alpha's first. */
export function allMembers<T>(match: {
	groupAlpha: { members: T[] };
	groupBravo: { members: T[] };
}): T[] {
	return [...match.groupAlpha.members, ...match.groupBravo.members];
}

/** The user's side of the match, or null if in neither group. */
export function resolveGroupMemberOf(args: {
	groupAlpha: { members: { id: number }[] };
	groupBravo: { members: { id: number }[] };
	userId: number | null | undefined;
}): "ALPHA" | "BRAVO" | null {
	if (!args.userId) return null;

	if (args.groupAlpha.members.some((m) => m.id === args.userId)) {
		return "ALPHA";
	}

	if (args.groupBravo.members.some((m) => m.id === args.userId)) {
		return "BRAVO";
	}

	return null;
}

/** Participants see each other's friend codes for a month after the match was created, staff always. */
export function canSeeFriendCodes(args: {
	matchCreatedAt: number;
	isParticipant: boolean;
	isStaff: boolean;
}) {
	if (args.isStaff) return true;
	if (!args.isParticipant) return false;

	return isAfter(
		databaseTimestampToDate(args.matchCreatedAt),
		subMonths(new Date(), 1),
	);
}

/** Tier a group held when its match started, from the snapshot taken then (thresholds shift with the season's distribution). `undefined` for matches predating the snapshot. */
export function groupTier(group: {
	tierName: TierName | null;
	tierIsPlus: DBBoolean;
}) {
	if (!group.tierName) return undefined;

	return { name: group.tierName, isPlus: Boolean(group.tierIsPlus) };
}

/**
 * Tier a member held when their match started, snapshotted the same way as {@link groupTier}.
 * `"CALCULATING"` when they had too few ranked sets of the season to have a tier.
 */
export function memberTier(member: {
	tierName: TierName | "CALCULATING" | null;
	tierIsPlus: DBBoolean;
}) {
	if (!member.tierName) return undefined;
	if (member.tierName === "CALCULATING") return "CALCULATING" as const;

	return { name: member.tierName, isPlus: Boolean(member.tierIsPlus) };
}
