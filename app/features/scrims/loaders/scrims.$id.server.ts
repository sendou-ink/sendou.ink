import type { LoaderFunctionArgs } from "react-router";
import { chatAccessible } from "~/features/chat/chat-utils";
import * as RoomLinkRepository from "~/features/chat/RoomLinkRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { databaseTimestampToDate } from "~/utils/dates";
import { notFoundIfFalsy } from "../../../utils/remix.server";
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

	const post = notFoundIfFalsy(
		await ScrimPostRepository.findById(Number(params.id)),
	);

	if (!Scrim.isAccepted(post)) {
		throw new Response(null, { status: 404 });
	}

	if (!Scrim.isParticipating(post, user.id) && !user.roles.includes("STAFF")) {
		throw new Response(null, { status: 403 });
	}

	const participantIds = Scrim.participantIdsListFromAccepted(post);

	const [anyUserPrefersNoScreen, anyUserPrefersNoSplatnet, roomLinks] =
		await Promise.all([
			UserRepository.anyUserPrefersNoScreen(participantIds),
			UserRepository.anyUserPrefersNoSplatnet(participantIds),
			RoomLinkRepository.findByUserIds(participantIds, 3),
		]);

	const mapByMap = await resolveMapByMap({ post, user });

	return {
		post,
		chatCode:
			(user.roles.includes("STAFF") || participantIds.includes(user.id)) &&
			chatAccessible({
				isStaff: user.roles.includes("STAFF"),
				expiresAfterDays: 1,
				comparedTo: databaseTimestampToDate(Scrim.getStartTime(post)),
			})
				? post.chatCode
				: undefined,
		anyUserPrefersNoScreen,
		anyUserPrefersNoSplatnet,
		roomLinks,
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
	const locked = Scrim.isTrackingLocked(maps, Scrim.getStartTime(post));

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
