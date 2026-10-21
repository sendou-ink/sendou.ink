import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import { getUser } from "~/features/auth/core/user.server";
import * as RouteChatRooms from "~/features/chat/RouteChatRooms.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import * as ScannerIngestRepository from "~/features/scanner-ingest/ScannerIngestRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { databaseTimestampNow } from "~/utils/dates";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import * as Leaderboard from "../core/Leaderboard";
import * as LobbySet from "../core/LobbySet";
import * as LobbyState from "../core/LobbyState";
import * as LobbyMatchRepository from "../LobbyMatchRepository.server";
import * as LobbyRepository from "../LobbyRepository.server";

export type LobbyLoaderData = SerializeFrom<typeof loader>;

const RESOLVED_NOTIFICATION_TYPES = [
	"LOBBY_CHECK_IN_OPENED",
	"LOBBY_STARTED",
	"LOBBY_PROMOTED",
	"LOBBY_HOST",
	"LOBBY_READY_CHECK",
] as const;

// xxx: permission check for VIEW and other permissions too?
export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = getUser();
	const { id } = parseParams({ params, schema: idObject });

	const lobby = notFoundIfNullish(await LobbyRepository.findById(id));

	const sets = await LobbyMatchRepository.findAllSetsByLobbyId(id);
	const reportedWeapons = await ReportedWeaponRepository.findAllByLobbyId(id);
	const ingestedScoreboards =
		await ScannerIngestRepository.findScoreboardsByLobbyId(id);
	const progression = await LobbyRepository.findProgressionStateById(id);

	const viewer = user
		? (lobby.participants.find((participant) => participant.id === user.id) ??
			null)
		: null;

	if (viewer) {
		for (const type of RESOLVED_NOTIFICATION_TYPES) {
			await resolveNotifications({
				userIds: [viewer.id],
				type,
				meta: { lobbyId: id },
			});
		}
	}

	const now = databaseTimestampNow();
	const latestSet = sets.at(-1) ?? null;
	const isPlaying = latestSet !== null && !LobbySet.isFinished(latestSet);
	const status = LobbyState.status({ lobby, isPlaying, now });

	const viewerSide =
		latestSet && viewer?.status === "IN_ROOM"
			? LobbySet.sideOf(latestSet, viewer.id)
			: null;
	const isPlayingUnfinishedSet = isPlaying && viewerSide !== null;

	const hasFriendCode = user
		? Boolean(await UserRepository.findCurrentFriendCodeByUserId(user.id))
		: false;

	const activeCount = lobby.participants.filter(
		(participant) =>
			participant.status === "IN_ROOM" || participant.status === "CHECKED_IN",
	).length;

	const viewerTeamChatRoomId = isPlayingUnfinishedSet
		? viewerSide === "ALPHA"
			? lobby.alphaChatRoomId
			: lobby.bravoChatRoomId
		: null;

	const userIds = R.unique([
		...lobby.participants.map((participant) => participant.id),
		...sets.flatMap((set) => set.participants.map((p) => p.userId)),
	]);

	const leaderboard = Leaderboard.rows({
		sets,
		weapons: playedWeapons({ sets, reportedWeapons, ingestedScoreboards }),
		roomMemberIds: lobby.participants
			.filter((participant) => participant.status === "IN_ROOM")
			.map((participant) => participant.id),
	});

	return {
		...(await UserCardRepository.findAllByUserIds({
			userIds,
			include: { friendCode: Boolean(viewer) },
		})),
		lobby,
		status,
		sets,
		reportedWeapons,
		ingestedScoreboards,
		leaderboard,
		readyChecks: progression?.readyChecks ?? [],
		viewer: viewer
			? {
					...viewer,
					side: viewerSide,
					isPlayingUnfinishedSet,
				}
			: null,
		viewerActions: LobbyState.viewerActions({
			status,
			viewer,
			isPlayingUnfinishedSet,
			hasFriendCode,
			activeCount,
			roomSize: lobby.roomSize,
			now,
			startsAt: lobby.startsAt,
		}),
		hasFriendCode,
		/** Room the viewer's voice call should be in: their team's while playing, the lobby's otherwise. */
		voiceRoomId: viewer ? (viewerTeamChatRoomId ?? lobby.chatRoomId) : null,
		chatRooms: await RouteChatRooms.resolve(
			user,
			viewer
				? [
						...(lobby.chatRoomId
							? [{ roomId: lobby.chatRoomId, autoOpen: !viewerTeamChatRoomId }]
							: []),
						...(viewerTeamChatRoomId
							? [{ roomId: viewerTeamChatRoomId, autoOpen: true }]
							: []),
					]
				: [],
		),
	};
};

/** One weapon per player per reported map: reported by hand or by the scanner, else read from a linked scoreboard. */
function playedWeapons({
	sets,
	reportedWeapons,
	ingestedScoreboards,
}: {
	sets: Awaited<ReturnType<typeof LobbyMatchRepository.findAllSetsByLobbyId>>;
	reportedWeapons: Awaited<
		ReturnType<typeof ReportedWeaponRepository.findAllByLobbyId>
	>;
	ingestedScoreboards: Awaited<
		ReturnType<typeof ScannerIngestRepository.findScoreboardsByLobbyId>
	>;
}) {
	return sets.flatMap((set) =>
		set.games.flatMap((game) => {
			if (!game.winnerSide) return [];

			const scoreboard = ingestedScoreboards.find(
				(candidate) =>
					candidate.lobbySetId === set.id && candidate.mapIndex === game.index,
			);

			return set.participants.flatMap((participant) => {
				if (!participant.side) return [];

				const weaponSplId =
					reportedWeapons.find(
						(weapon) =>
							weapon.lobbySetId === set.id &&
							weapon.mapIndex === game.index &&
							weapon.userId === participant.userId,
					)?.weaponSplId ??
					scoreboard?.data.players.find(
						(player) => player.userId === participant.userId,
					)?.weaponSplId;

				return weaponSplId ? [{ userId: participant.userId, weaponSplId }] : [];
			});
		}),
	);
}
