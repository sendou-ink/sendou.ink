import type { LoaderFunctionArgs } from "react-router";
import type { RouteChatRoom } from "~/features/chat/chat-types";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { notFoundIfNullish } from "../../../utils/remix.server";
import {
	type AuthenticatedUser,
	requireUser,
} from "../../auth/core/user.server";
import * as Scrim from "../core/Scrim";
import * as ScrimMapByMap from "../core/ScrimMapByMap";
import * as ScrimMapListRepository from "../ScrimMapListRepository.server";
import * as ScrimMapRepository from "../ScrimMapRepository.server";
import * as ScrimPostRepository from "../ScrimPostRepository.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = requireUser();

	const post = notFoundIfNullish(
		await ScrimPostRepository.findById(Number(params.id)),
	);

	if (!Scrim.isAccepted(post)) {
		throw new Response(null, { status: 404 });
	}

	if (!Scrim.isParticipating(post, user.id) && !user.roles.includes("STAFF")) {
		throw new Response(null, { status: 403 });
	}

	await resolveNotifications({
		userIds: [user.id],
		type: "SCRIM_SCHEDULED",
		meta: { id: post.id },
	});
	await resolveNotifications({
		userIds: [user.id],
		type: "SCRIM_STARTING_SOON",
		meta: { id: post.id },
	});

	const participantIds = Scrim.participantIdsListFromAccepted(post);

	const anyUserPrefersNoScreen =
		await UserRepository.anyUserPrefersNoScreen(participantIds);

	const mapByMap = await resolveMapByMap({ post, user });

	return {
		...(await UserCardRepository.findAllByUserIds({
			userIds: participantIds,
			include: { friendCode: true },
		})),
		post,
		// staff observers chat alongside the participants
		chatRooms: (post.chatRoomId !== null &&
		(participantIds.includes(user.id) || user.roles.includes("STAFF"))
			? [{ roomId: post.chatRoomId, autoOpen: true }]
			: []) satisfies RouteChatRoom[],
		anyUserPrefersNoScreen,
		mapByMap,
	};
};

async function resolveMapByMap({
	post,
	user,
}: {
	post: NonNullable<Awaited<ReturnType<typeof ScrimPostRepository.findById>>>;
	user: AuthenticatedUser;
}) {
	const [mapLists, maps] = await Promise.all([
		ScrimMapListRepository.findMapListsByScrimPostId(post.id),
		ScrimMapRepository.findMapsByScrimPostId(post.id),
	]);

	const pool = mapLists.length > 0 ? ScrimMapByMap.unionPool(mapLists) : null;
	const currentMap = maps.find((m) => m.reportedAt === null) ?? null;
	const viewerSide = Scrim.sideOfUser(post, user.id);
	const locked = Scrim.isTrackingLocked({
		startTime: Scrim.getStartTime(post),
		maps,
		mapLists,
	});

	const ownList = viewerSide
		? mapLists.find((l) => l.side === viewerSide)
		: undefined;

	return {
		mapLists,
		maps,
		currentMap,
		viewerSide,
		locked,
		pool: pool ? pool.stageModePairs : null,
		ownPool: ownList?.mapList ?? null,
	};
}
