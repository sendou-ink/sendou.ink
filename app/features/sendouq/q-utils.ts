import { redirect } from "@remix-run/node";
import { modesShort, rankedModesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import { databaseTimestampToDate } from "~/utils/dates";
import {
	SENDOUQ_LOOKING_PAGE,
	SENDOUQ_PAGE,
	SENDOUQ_PREPARING_PAGE,
	sendouQMatchPage,
} from "~/utils/urls";
import { accountCreatedInTheLastSixMonths } from "~/utils/users";
import type { MapPool } from "../map-list-generator/core/map-pool";
import type { SQGroup, SQOwnGroup } from "./core/SQManager.server";
import { SENDOUQ } from "./q-constants";

function groupRedirectLocation(group?: SQOwnGroup) {
	if (group?.status === "PREPARING") return SENDOUQ_PREPARING_PAGE;
	if (group?.matchId) return sendouQMatchPage(group.matchId);
	if (group) return SENDOUQ_LOOKING_PAGE;

	return SENDOUQ_PAGE;
}

/** User needs to be on certain page depending on their SendouQ group status. This functions throws a `Redirect` if they are trying to load the wrong page. */
export function sqRedirectIfNeeded({
	ownGroup,
	currentLocation,
}: {
	ownGroup?: SQOwnGroup;
	currentLocation: "default" | "preparing" | "looking" | "match";
}) {
	const newLocation = groupRedirectLocation(ownGroup);

	// we are already in the correct location, don't redirect
	if (currentLocation === "default" && newLocation === SENDOUQ_PAGE) return;
	if (currentLocation === "preparing" && newLocation === SENDOUQ_PREPARING_PAGE)
		return;
	if (currentLocation === "looking" && newLocation === SENDOUQ_LOOKING_PAGE)
		return;
	if (currentLocation === "match" && newLocation.includes("match")) return;

	throw redirect(newLocation);
}

export function mapPoolOk(mapPool: MapPool) {
	for (const modeShort of rankedModesShort) {
		if (
			modeShort === "SZ" &&
			mapPool.countMapsByMode(modeShort) !== SENDOUQ.SZ_MAP_COUNT
		) {
			return false;
		}

		if (
			modeShort !== "SZ" &&
			mapPool.countMapsByMode(modeShort) !== SENDOUQ.OTHER_MODE_MAP_COUNT
		) {
			return false;
		}
	}

	for (const stageId of stageIds) {
		if (
			mapPool.stageModePairs.filter((pair) => pair.stageId === stageId).length >
			SENDOUQ.MAX_STAGE_REPEAT_COUNT
		) {
			return false;
		}
	}

	return true;
}

export function userCanJoinQueueAt(
	user: { id: number; discordId: string },
	friendCode: { createdAt: number; submitterUserId: number },
) {
	if (!accountCreatedInTheLastSixMonths(user.discordId)) return "NOW";

	// set by admin
	if (friendCode.submitterUserId !== user.id) return "NOW";

	const friendCodeCreatedAt = databaseTimestampToDate(friendCode.createdAt);

	const twentyFourHoursAgo = new Date();
	twentyFourHoursAgo.setDate(twentyFourHoursAgo.getDate() - 1);

	if (friendCodeCreatedAt < twentyFourHoursAgo) {
		return "NOW";
	}

	const canJoinQueueAt = new Date(friendCodeCreatedAt);
	canJoinQueueAt.setDate(canJoinQueueAt.getDate() + 1);

	return canJoinQueueAt;
}

export function resolveFutureMatchModes({
	ownGroup,
	theirGroup,
}: {
	ownGroup: Pick<SQGroup, "modePreferences">;
	theirGroup: Pick<SQGroup, "modePreferences">;
}) {
	const ourModes = ownGroup.modePreferences;
	const theirModes = theirGroup.modePreferences;

	const overlap = ourModes.filter((mode) => theirModes.includes(mode));
	if (overlap.length > 0) {
		return overlap;
	}

	const union = modesShort.filter(
		(mode) => ourModes.includes(mode) || theirModes.includes(mode),
	);

	return union;
}
