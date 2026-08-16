import { db } from "#lib/server/db/sql.ts";
import { databaseTimestampToDate } from "#lib/utils/dates.ts";

export const FULL_GROUP_SIZE = 4;

export type GroupExpiryStatus = "EXPIRING_SOON" | "EXPIRED";

/**
 * Lite port of the SendouQ in-process state for the app shell: only what the
 * sidebar's friend activity needs (which group a user is in, its member count,
 * match id and freshness). The full `SendouQ` class arrives with the sendouq
 * migration; unlike the React singleton this queries fresh per call.
 */
export interface LiteGroup {
	id: number;
	status: "PREPARING" | "ACTIVE" | "INACTIVE" | "READY_CHECK";
	latestActionAt: number;
	matchId: number | null;
	memberUserIds: number[];
}

export async function findCurrentGroupsLite(): Promise<LiteGroup[]> {
	const rows = await db
		.selectFrom("Group")
		.innerJoin("GroupMember", "GroupMember.groupId", "Group.id")
		.leftJoin("GroupMatch", (join) =>
			join.on((eb) =>
				eb.or([
					eb("GroupMatch.alphaGroupId", "=", eb.ref("Group.id")),
					eb("GroupMatch.bravoGroupId", "=", eb.ref("Group.id")),
				]),
			),
		)
		.select([
			"Group.id",
			"Group.status",
			"Group.latestActionAt",
			"GroupMatch.id as matchId",
			"GroupMember.userId",
		])
		// != INACTIVE (same set as ACTIVE or PREPARING) so the partial
		// group_status_active index applies
		.where("Group.status", "!=", "INACTIVE")
		.execute();

	const groups = new Map<number, LiteGroup>();
	for (const row of rows) {
		const group = groups.get(row.id) ?? {
			id: row.id,
			status: row.status,
			latestActionAt: row.latestActionAt,
			matchId: row.matchId,
			memberUserIds: [],
		};
		group.memberUserIds.push(row.userId);
		groups.set(row.id, group);
	}

	return [...groups.values()];
}

/** Finds the group a user belongs to, or `undefined` when they are not queued. */
export function findOwnGroupLite(groups: LiteGroup[], userId: number) {
	return groups.find((group) => group.memberUserIds.includes(userId));
}

export function groupExpiryStatus(
	latestActionAt: number,
): GroupExpiryStatus | null {
	// group expires in 30min without actions performed
	const groupExpiresAt =
		databaseTimestampToDate(latestActionAt).getTime() + 30 * 60 * 1000;

	const now = Date.now();

	if (now > groupExpiresAt) {
		return "EXPIRED";
	}

	const tenMinutesFromNow = now + 10 * 60 * 1000;

	if (tenMinutesFromNow > groupExpiresAt) {
		return "EXPIRING_SOON";
	}

	return null;
}
