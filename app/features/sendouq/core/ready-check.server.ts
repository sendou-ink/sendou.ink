import { addMinutes } from "date-fns";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { notify } from "~/features/notifications/core/notify.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import {
	matchMapList,
	matchTiers,
} from "~/features/sendouq-match/core/match.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import { refreshStreamsCache } from "~/features/sendouq-streams/core/streams.server";
import { databaseTimestampToDate } from "~/utils/dates";
import {
	SENDOUQ,
	SENDOUQ_LOOKING_CHANNEL,
	sqGroupChannel,
} from "../q-constants";
import { resolveFutureMatchModes } from "../q-utils";
import { refreshSendouQInstance, SendouQ } from "./SendouQ.server";

export type ReadyCheck = NonNullable<
	Awaited<ReturnType<typeof SQGroupRepository.findReadyCheckByGroupId>>
>;

type ReadyCheckGroup = {
	id: number;
	chatRoomId: number | null;
	members: Array<{ id: number }>;
};

/** When the ready check runs out, both groups going back to looking. */
export function expiresAt(readyCheck: { createdAt: number }) {
	return addMinutes(
		databaseTimestampToDate(readyCheck.createdAt),
		SENDOUQ.READY_CHECK_MINUTES,
	);
}

/** Has the ready check run out of time to be confirmed? */
export function hasExpired(readyCheck: { createdAt: number }) {
	return expiresAt(readyCheck) <= new Date();
}

/** Starts a ready check between two matched groups; both leave the looking pool while members confirm. The starter counts as ready right away. */
export async function start({
	ownGroup,
	theirGroup,
	actorUserId,
}: {
	ownGroup: ReadyCheckGroup;
	theirGroup: ReadyCheckGroup;
	actorUserId: number;
}) {
	await SQGroupRepository.insertReadyCheck({
		alphaGroupId: ownGroup.id,
		bravoGroupId: theirGroup.id,
		confirmedByUserId: actorUserId,
	});

	await refreshSendouQInstance();

	// both groups revalidate (→ sent to the ready check by their looking loader) and play
	// the sound; sent to the groups' topics so it reaches every member, not just chat participants
	ChatSystemMessage.send([
		{
			channel: sqGroupChannel(ownGroup.id),
			type: "READY_CHECK_STARTED",
		},
		{
			channel: sqGroupChannel(theirGroup.id),
			type: "READY_CHECK_STARTED",
		},
		{ channel: SENDOUQ_LOOKING_CHANNEL },
	]);

	notify({
		userIds: [
			...ownGroup.members.map((m) => m.id),
			...theirGroup.members.map((m) => m.id),
		],
		defaultSeenUserIds: [actorUserId],
		notification: {
			type: "SQ_READY_CHECK",
		},
	});
}

/** Records the user as ready; once everyone from both groups is, the match is created. @returns its id, or `null` if others are still to confirm or the check already ended */
export async function confirm({
	readyCheck,
	userId,
}: {
	readyCheck: ReadyCheck;
	userId: number;
}) {
	const confirmation = await SQGroupRepository.insertReadyCheckConfirmation({
		readyCheckId: readyCheck.id,
		userId,
	});

	// the ready check ended (e.g. ran out of time) while this request was in flight
	if (!confirmation) return null;

	await resolveNotifications({ userIds: [userId], type: "SQ_READY_CHECK" });

	if (!confirmation.everyoneIsReady) {
		revalidateGroups(readyCheck);

		return null;
	}

	// the season ended while the groups were confirming, so there is no rated match
	// to make. nobody is at fault for that, so it ends without missed check marks
	// and the ready page's loader sends both groups back to looking
	if (!Seasons.current()) {
		await abort(readyCheck);

		return null;
	}

	return createMatch({ readyCheck, actorUserId: userId });
}

/** Ends a timed-out ready check: both groups go back to looking with challenges gone, and unconfirmed members are marked as having missed it so the rest can kick them. */
export async function expire(readyCheck: {
	id: number;
	alphaGroupId: number;
	bravoGroupId: number;
	members: Array<{ userId: number }>;
}) {
	await endReadyCheck(readyCheck, { markMissedMembers: true });
}

/** Ends a ready check that can no longer result in a match; both groups go back to looking with nobody marked as having missed it. */
export async function abort(readyCheck: {
	id: number;
	alphaGroupId: number;
	bravoGroupId: number;
	members: Array<{ userId: number }>;
}) {
	await endReadyCheck(readyCheck, { markMissedMembers: false });
}

async function endReadyCheck(
	readyCheck: {
		id: number;
		alphaGroupId: number;
		bravoGroupId: number;
		members: Array<{ userId: number }>;
	},
	{ markMissedMembers }: { markMissedMembers: boolean },
) {
	await SQGroupRepository.deleteReadyCheck({
		id: readyCheck.id,
		markMissedMembers,
	});

	// the ready check no longer exists so there is nothing to respond to
	await resolveNotifications({
		userIds: readyCheck.members.map((member) => member.userId),
		type: "SQ_READY_CHECK",
	});

	await refreshSendouQInstance();

	revalidateGroups(readyCheck);
	// both groups return to the looking pool, so its shape changed for everyone
	ChatSystemMessage.send({ channel: SENDOUQ_LOOKING_CHANNEL });
}

async function createMatch({
	readyCheck,
	actorUserId,
}: {
	readyCheck: ReadyCheck;
	actorUserId: number;
}) {
	const alphaGroup = SendouQ.findUncensoredGroupById(readyCheck.alphaGroupId);
	const bravoGroup = SendouQ.findUncensoredGroupById(readyCheck.bravoGroupId);
	if (!alphaGroup || !bravoGroup) return null;

	const alphaPreferences =
		await SQGroupRepository.findMapModePreferencesByGroupId(alphaGroup.id);
	const bravoPreferences =
		await SQGroupRepository.findMapModePreferencesByGroupId(bravoGroup.id);

	const modesIncluded = resolveFutureMatchModes(alphaGroup, bravoGroup);

	const mapList = await matchMapList(
		{
			id: alphaGroup.id,
			preferences: alphaPreferences,
		},
		{
			id: bravoGroup.id,
			preferences: bravoPreferences,
		},
		modesIncluded,
	);

	const createdMatch = await SQMatchRepository.insert({
		alphaGroupId: alphaGroup.id,
		bravoGroupId: bravoGroup.id,
		mapList,
		tiers: await matchTiers([alphaGroup, bravoGroup]),
		readyCheckId: readyCheck.id,
	});

	await refreshSendouQInstance();
	refreshStreamsCache();

	ChatSystemMessage.send([
		{
			channel: sqGroupChannel(readyCheck.alphaGroupId),
			type: "MATCH_STARTED",
		},
		{
			channel: sqGroupChannel(readyCheck.bravoGroupId),
			type: "MATCH_STARTED",
		},
		{ channel: SENDOUQ_LOOKING_CHANNEL },
	]);

	notify({
		userIds: readyCheck.members.map((member) => member.userId),
		defaultSeenUserIds: [actorUserId],
		notification: {
			type: "SQ_NEW_MATCH",
			meta: {
				matchId: createdMatch.id,
			},
		},
	});

	// the match superseded the ready check everyone was notified about
	await resolveNotifications({
		userIds: readyCheck.members.map((member) => member.userId),
		type: "SQ_READY_CHECK",
	});

	return createdMatch.id;
}

function revalidateGroups(readyCheck: {
	alphaGroupId: number;
	bravoGroupId: number;
}) {
	ChatSystemMessage.send([
		{ channel: sqGroupChannel(readyCheck.alphaGroupId) },
		{ channel: sqGroupChannel(readyCheck.bravoGroupId) },
	]);
}
