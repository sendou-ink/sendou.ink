import { data, type LoaderFunctionArgs, redirect } from "react-router";
import * as R from "remeda";
import * as AssociationRepository from "~/features/associations/AssociationRepository.server";
import * as Visibility from "~/features/associations/core/Visibility";
import { getUser } from "~/features/auth/core/user.server";
import * as RouteChatRooms from "~/features/chat/RouteChatRooms.server";
import * as MatchProfileRepository from "~/features/match-profile/MatchProfileRepository.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import * as ScannerIngestRepository from "~/features/scanner-ingest/ScannerIngestRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { hasPermission } from "~/modules/permissions/utils";
import * as SearchParams from "~/modules/search-params/search-params";
import { databaseTimestampNow } from "~/utils/dates";
import type { SerializeFrom } from "~/utils/remix";
import { notFound, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import * as Leaderboard from "../core/Leaderboard";
import * as LobbyMapList from "../core/LobbyMapList.server";
import * as LobbySet from "../core/LobbySet";
import * as LobbyState from "../core/LobbyState";
import * as ScoreboardAttribution from "../core/ScoreboardAttribution";
import * as LobbyMatchRepository from "../LobbyMatchRepository.server";
import * as LobbyRepository from "../LobbyRepository.server";
import {
	LOBBY_LINK_ONLY_ERROR,
	LOBBY_SIDE_TEAM_ID,
} from "../lobbies-constants";
import { lobbySearchParams } from "../lobbies-search-params";

export type LobbyLoaderData = SerializeFrom<typeof loader>;

const RESOLVED_NOTIFICATION_TYPES = [
	"LOBBY_CHECK_IN_OPENED",
	"LOBBY_STARTED",
	"LOBBY_PROMOTED",
	"LOBBY_HOST",
	"LOBBY_READY_CHECK",
] as const;

export const loader = async ({ params, request, url }: LoaderFunctionArgs) => {
	const user = getUser();
	const { id } = parseParams({ params, schema: idObject });

	const { key } = lobbySearchParams.parse(request);

	const lobby = await LobbyRepository.findById(id, { shareKey: key });
	if (!lobby) {
		if (await LobbyRepository.isLinkOnlyById(id)) {
			throw data(LOBBY_LINK_ONLY_ERROR, { status: 403 });
		}
		notFound();
	}

	// keeps the address bar a working invite link
	if (lobby.isLinkOnly && lobby.shareKey !== null && key !== lobby.shareKey) {
		throw redirect(withShareKey(url, lobby.shareKey));
	}

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
	const { status, isCheckInOpen } = LobbyState.statusAndCheckIn({
		lobby,
		participants: lobby.participants,
		isPlaying,
		now,
	});

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
			? latestSet.alphaChatRoomId
			: latestSet.bravoChatRoomId
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
		isCheckInOpen,
		sets,
		/** Players of the current set who voted for the map being played */
		currentMapVoterIds: await currentMapVoterIds(latestSet),
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
			isKicked: lobby.isViewerKicked,
			isCheckInOpen,
			activeCount,
			roomSize: lobby.roomSize,
			now,
			startsAt: lobby.startsAt,
		}),
		hasFriendCode,
		/** The host's current visibility of the lobby to edit and who they can limit it to */
		visibility:
			user && hasPermission(lobby, "MANAGE", user)
				? await visibilityForHost({ lobby, hostUserId: user.id })
				: null,
		/** The viewer's team chat while they play a set, a voice call in their previous one follows them into it. */
		teamChatRoomId: viewerTeamChatRoomId,
		chatRooms: await RouteChatRooms.resolve(
			user,
			// a player of the set gets the lobby's chat and their team's side by side
			viewer || lobby.hasViewerLeft
				? [lobby.chatRoomId, viewerTeamChatRoomId]
						.filter((roomId) => typeof roomId === "number")
						.map((roomId) => ({ roomId, autoOpen: true }))
				: [],
		),
	};
};

function withShareKey(url: URL, shareKey: string) {
	const { next } = SearchParams.applyToSearchParams(
		lobbySearchParams,
		url.searchParams,
		{ key: shareKey },
	);

	return `${url.pathname}?${next}`;
}

async function visibilityForHost({
	lobby,
	hostUserId,
}: {
	lobby: LobbyRepository.LobbyById;
	hostUserId: number;
}) {
	const rows = await LobbyRepository.findVisibilityRowsById(lobby.id);
	const associations =
		await AssociationRepository.findByMemberUserId(hostUserId);

	return {
		associations: Visibility.withAudiencesOf(associations, rows),
		current: lobby.isLinkOnly
			? {
					baseVisibility: "LINK_ONLY" as const,
					notFoundVisibility: { at: null, forAssociation: "PUBLIC" as const },
				}
			: Visibility.toForm(rows),
	};
}

async function currentMapVoterIds(
	set: LobbyMatchRepository.LobbySetWithGames | null,
) {
	const index = set ? LobbySet.currentGameIndex(set) : null;
	if (!set || index === null) return [];

	const map = set.games[index];
	if (map.source === null || map.source === "DEFAULT") return [];

	return LobbyMapList.voters({
		map,
		participants: set.participants,
		profiles: await MatchProfileRepository.findAllMapModePreferencesByUserIds(
			set.participants
				.filter((participant) => participant.side !== null)
				.map((participant) => participant.userId),
		),
	});
}

/**
 * One weapon per player per reported map: reported by hand or by the scanner, else read from a linked scoreboard's
 * row, attributed to the player by their scan's POV seat or by the names the lobby's scoreboards show them under.
 */
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
	const reportedWeaponOf = (
		set: (typeof sets)[number],
		game: (typeof set.games)[number],
		userId: number,
	) =>
		reportedWeapons.find(
			(weapon) =>
				weapon.lobbySetId === set.id &&
				weapon.mapIndex === game.index &&
				weapon.userId === userId,
		)?.weaponSplId ?? null;

	const scoreboardGames = sets.flatMap((set) =>
		set.games.flatMap((game) => {
			const scoreboard = ingestedScoreboards.find(
				(candidate) =>
					candidate.lobbySetId === set.id && candidate.mapIndex === game.index,
			);

			return game.winnerSide && scoreboard ? [{ set, game, scoreboard }] : [];
		}),
	);
	const rowUserIds = ScoreboardAttribution.rowUserIds(
		scoreboardGames.map(({ set, game, scoreboard }) => ({
			rows: scoreboard.data.players.map((player) => ({
				name: player.name,
				side:
					player.tournamentTeamId === LOBBY_SIDE_TEAM_ID.ALPHA
						? "ALPHA"
						: "BRAVO",
				weaponSplId: player.weaponSplId,
				userId: player.userId,
			})),
			players: set.participants.flatMap((participant) =>
				participant.side
					? [
							{
								userId: participant.userId,
								side: participant.side,
								inGameName: participant.inGameName,
								reportedWeaponSplId: reportedWeaponOf(
									set,
									game,
									participant.userId,
								),
							},
						]
					: [],
			),
		})),
	);

	return sets.flatMap((set) =>
		set.games.flatMap((game) => {
			if (!game.winnerSide) return [];

			const scoreboardIdx = scoreboardGames.findIndex(
				(candidate) => candidate.game === game,
			);
			const scoreboardWeaponOf = (userId: number) => {
				if (scoreboardIdx === -1) return null;

				const rowIdx = rowUserIds[scoreboardIdx]!.indexOf(userId);
				if (rowIdx === -1) return null;

				return (
					scoreboardGames[scoreboardIdx]!.scoreboard.data.players[rowIdx]!
						.weaponSplId ?? null
				);
			};

			return set.participants.flatMap((participant) => {
				if (!participant.side) return [];

				const weaponSplId =
					reportedWeaponOf(set, game, participant.userId) ??
					scoreboardWeaponOf(participant.userId);

				return weaponSplId ? [{ userId: participant.userId, weaponSplId }] : [];
			});
		}),
	);
}
