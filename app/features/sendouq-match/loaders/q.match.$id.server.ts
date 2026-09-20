import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import type { RouteChatRoomInput } from "~/features/chat/chat-types";
import * as RouteChatRooms from "~/features/chat/RouteChatRooms.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import * as ScannerIngestRepository from "~/features/scanner-ingest/ScannerIngestRepository.server";
import { SendouQ } from "~/features/sendouq/core/SendouQ.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { qMatchPageParamsSchema } from "../q-match-schemas";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = getUser();
	const matchId = parseParams({
		params,
		schema: qMatchPageParamsSchema,
	}).id;

	const matchUnmapped = notFoundIfNullish(
		await SQMatchRepository.findById(matchId),
	);

	const matchUsers = [
		...matchUnmapped.groupAlpha.members,
		...matchUnmapped.groupBravo.members,
	].map((m) => m.id);

	const isStaff = user?.roles.includes("STAFF") ?? false;
	const isParticipant = Boolean(user && matchUsers.includes(user.id));

	if (user && isParticipant) {
		await resolveNotifications({
			userIds: [user.id],
			type: "SQ_NEW_MATCH",
			meta: { matchId },
		});
	}

	const reportedWeapons = await ReportedWeaponRepository.findByMatchId(matchId);
	const ingestedScoreboards =
		await ScannerIngestRepository.findScoreboardsByGroupMatchId(matchId);

	const match = SendouQ.mapMatch(matchUnmapped, user);

	const viewerGroup = user
		? [matchUnmapped.groupAlpha, matchUnmapped.groupBravo].find((group) =>
				group.members.some((member) => member.id === user.id),
			)
		: undefined;

	const joinedNewGroup = (userId: number) => {
		const currentGroup = SendouQ.findOwnGroup(userId);
		return Boolean(currentGroup && currentGroup.matchId !== matchId);
	};

	return {
		// e.g. the group already requeued, so the viewer has nothing left to requeue with
		hasJoinedNewGroup: Boolean(user && joinedNewGroup(user.id)),
		// requeueing with the same group needs every member of it free of other groups
		someGroupMemberHasJoinedNewGroup: Boolean(
			viewerGroup?.members.some((member) => joinedNewGroup(member.id)),
		),
		...(await UserCardRepository.findAllByUserIds({
			userIds: matchUsers,
			include: { friendCode: isStaff || isParticipant },
		})),
		match,
		reportedWeapons,
		ingestedScoreboards,
		isOffSeason: Seasons.current() === null,
		chatRooms: await RouteChatRooms.resolve(user, routeChatRoomInputs()),
	};

	function routeChatRoomInputs(): RouteChatRoomInput[] {
		if (!user) return [];

		if (isParticipant) {
			const ownGroup = matchUnmapped.groupAlpha.members.some(
				(member) => member.id === user.id,
			)
				? match.groupAlpha
				: match.groupBravo;

			return [match.chatRoomId, ownGroup.chatRoomId]
				.filter((id): id is number => typeof id === "number")
				.map((roomId) => ({ roomId, autoOpen: true }));
		}

		if (!isStaff) return [];

		return [
			// staff observers chat alongside the participants in the match room
			{ roomId: matchUnmapped.chatRoomId, autoOpen: true },
			// the group chats stay private team spaces: staff only ever reads them
			{
				roomId: matchUnmapped.groupAlpha.chatRoomId,
				autoOpen: false,
				label: "Group Alpha",
			},
			{
				roomId: matchUnmapped.groupBravo.chatRoomId,
				autoOpen: false,
				label: "Group Bravo",
			},
		].filter(
			(room): room is RouteChatRoomInput => typeof room.roomId === "number",
		);
	}
};

export type SendouQMatchLoaderData = SerializeFrom<typeof loader>;
