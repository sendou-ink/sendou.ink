import { requireUser } from "~/features/auth/core/user.server";
import { linkStoredMatches } from "~/features/scanner-ingest/core/relink.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as UserActivity from "~/features/user-activity/core/UserActivity.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { defineAction } from "~/form/define-action.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { databaseTimestampNow } from "~/utils/dates";
import {
	errorToast,
	errorToastIfFalsy,
	notFoundIfNullish,
} from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import { assertUnreachable } from "~/utils/types";
import * as LobbyProgression from "../core/LobbyProgression.server";
import * as LobbySet from "../core/LobbySet";
import * as LobbyState from "../core/LobbyState";
import * as LobbyMatchRepository from "../LobbyMatchRepository.server";
import * as LobbyRepository from "../LobbyRepository.server";
import type { LobbyBestOf } from "../lobbies-constants";
import { lobbyActionSchema } from "../lobbies-schemas";

export const action = defineAction(
	{ params: idObject, body: lobbyActionSchema },
	async ({ params: { id }, body }) => {
		const user = requireUser();

		const lobby = notFoundIfNullish(await LobbyRepository.findById(id));
		errorToastIfFalsy(lobby.endedAt === null, "The lobby has ended");

		const sets = await LobbyMatchRepository.findAllSetsByLobbyId(id);
		const viewer = lobby.participants.find(
			(participant) => participant.id === user.id,
		);
		const now = databaseTimestampNow();
		const hasStarted = now >= lobby.startsAt;

		const setOfLobby = (setId: number) =>
			notFoundIfNullish(sets.find((set) => set.id === setId));
		const unfinishedSetIdOf = (participant: { id: number }) => {
			const set = sets.at(-1);
			if (!set || LobbySet.isFinished(set)) return null;

			return LobbySet.sideOf(set, participant.id) ? set.id : null;
		};
		const requireNoConflict = () => {
			const conflict = UserActivity.lobbyConflict(
				UserActivity.resolve(user.id),
			);
			errorToastIfFalsy(
				conflict !== "SENDOUQ",
				"Leave SendouQ before checking in to a lobby",
			);
			errorToastIfFalsy(
				conflict !== "TOURNAMENT",
				"You can't check in to a lobby while playing in a tournament",
			);
		};
		const activeCount = lobby.participants.filter(
			(participant) =>
				participant.status === "IN_ROOM" || participant.status === "CHECKED_IN",
		).length;

		switch (body._action) {
			case "SIGN_UP": {
				errorToastIfFalsy(!viewer, "Already signed up");
				errorToastIfFalsy(
					await UserRepository.findCurrentFriendCodeByUserId(user.id),
					"Set your friend code first",
				);

				const withSpotCount = lobby.participants.filter(
					(participant) => participant.status !== "WAITLISTED",
				).length;
				const isPresentRightAway = hasStarted && activeCount < lobby.roomSize;
				if (isPresentRightAway) requireNoConflict();

				await LobbyRepository.insertParticipant({
					lobbyId: id,
					userId: user.id,
					status: isPresentRightAway
						? "CHECKED_IN"
						: !hasStarted && withSpotCount < lobby.roomSize
							? "REGISTERED"
							: "WAITLISTED",
				});
				break;
			}
			case "CHECK_IN": {
				errorToastIfFalsy(viewer, "Not signed up");
				const actions = viewerActions({
					lobby,
					sets,
					viewer,
					now,
					activeCount,
				});
				errorToastIfFalsy(actions.CHECK_IN, "Can't check in right now");
				requireNoConflict();

				await LobbyRepository.updateParticipant({
					lobbyId: id,
					userId: user.id,
					status: "CHECKED_IN",
				});
				if (hasStarted) {
					await LobbyMatchRepository.confirmReadyChecks({
						lobbyId: id,
						userId: user.id,
					});
				}
				break;
			}
			case "CONFIRM_READY": {
				errorToastIfFalsy(viewer, "Not signed up");
				requireNoConflict();

				const hasConfirmed = await LobbyMatchRepository.confirmReadyChecks({
					lobbyId: id,
					userId: user.id,
				});
				errorToastIfFalsy(hasConfirmed, "No ready check to confirm");

				if (viewer.status === "REGISTERED" || viewer.status === "WAITLISTED") {
					await LobbyRepository.updateParticipant({
						lobbyId: id,
						userId: user.id,
						status: "CHECKED_IN",
					});
				}
				break;
			}
			case "LEAVE": {
				errorToastIfFalsy(viewer, "Not signed up");

				await LobbyRepository.removeParticipant({
					lobbyId: id,
					userId: user.id,
					unfinishedSetId: unfinishedSetIdOf(viewer),
				});
				break;
			}
			case "TOGGLE_DROP_AFTER_SET": {
				errorToastIfFalsy(viewer, "Not signed up");
				errorToastIfFalsy(
					viewer.isDroppingAfterSet || unfinishedSetIdOf(viewer) !== null,
					"Not playing a set",
				);

				await LobbyRepository.updateParticipant({
					lobbyId: id,
					userId: user.id,
					isDroppingAfterSet: !viewer.isDroppingAfterSet,
				});
				break;
			}
			case "REPORT_MAP": {
				const set = setOfLobby(body.setId);
				const result = await LobbyMatchRepository.reportGame({
					setId: set.id,
					winnerSide: body.winnerSide,
					reportedCount: body.reportedCount,
				});
				if (result === "STALE") return null;
				if (result === "NOT_ALLOWED") return errorToast("Can't report");

				await linkStoredMatches({ type: "lobby", lobbySetId: set.id });
				break;
			}
			case "UNDO_MAP_REPORT": {
				const set = setOfLobby(body.setId);
				const result = await LobbyMatchRepository.undoLatestReport({
					setId: set.id,
					reportedCount: body.reportedCount,
				});
				if (result === "STALE") return null;
				if (result === "NOT_ALLOWED") return errorToast("Can't undo");
				break;
			}
			case "CONFIRM_SET": {
				const set = setOfLobby(body.setId);
				const result = await LobbyMatchRepository.confirmSet(set.id);
				if (result === "NOT_ALLOWED") return errorToast("Can't confirm");
				break;
			}
			case "DISPUTE_SET": {
				const set = setOfLobby(body.setId);
				const result = await LobbyMatchRepository.disputeSet(set.id);
				if (result === "NOT_ALLOWED") return errorToast("Can't dispute");
				break;
			}
			case "REPORT_WEAPON": {
				const set = notFoundIfNullish(latestPlayedSetOf(sets, user.id));
				errorToastIfFalsy(body.mapIndex < set.games.length, "Map out of range");

				await ReportedWeaponRepository.upsertOwnLobby({
					lobbySetId: set.id,
					mapIndex: body.mapIndex,
					weaponSplId: body.weaponSplId,
				});
				break;
			}
			case "UNDO_WEAPON_REPORT": {
				const set = notFoundIfNullish(latestPlayedSetOf(sets, user.id));

				await ReportedWeaponRepository.deleteOwnByLobbySetMapIndex({
					lobbySetId: set.id,
					mapIndex: body.mapIndex,
				});
				break;
			}
			case "UPDATE_SETTINGS": {
				requirePermission(lobby, "MANAGE");

				await LobbyRepository.updateSettings({
					id,
					bestOf: Number(body.bestOf) as LobbyBestOf,
					modes: body.modes,
				});
				break;
			}
			case "KICK": {
				requirePermission(lobby, "MANAGE");
				const target = notFoundIfNullish(
					lobby.participants.find(
						(participant) => participant.id === body.userId,
					),
				);

				await LobbyRepository.removeParticipant({
					lobbyId: id,
					userId: target.id,
					unfinishedSetId: unfinishedSetIdOf(target),
				});
				break;
			}
			case "TOGGLE_SIT_OUT": {
				requirePermission(lobby, "MANAGE");
				const target = notFoundIfNullish(
					lobby.participants.find(
						(participant) => participant.id === body.userId,
					),
				);

				await LobbyRepository.updateParticipant({
					lobbyId: id,
					userId: target.id,
					isSittingOut: !target.isSittingOut,
				});
				break;
			}
			case "END_LOBBY": {
				requirePermission(lobby, "MANAGE");

				await LobbyRepository.end(id);
				break;
			}
			default: {
				assertUnreachable(body);
			}
		}

		await LobbyProgression.advance(id, {
			hasChanged: true,
			// joining or leaving the lobby changes their chat rooms
			affectedUserIds:
				body._action === "KICK"
					? [body.userId]
					: body._action === "SIGN_UP" || body._action === "LEAVE"
						? [user.id]
						: [],
		});

		return null;
	},
);

/** The latest set the user played a side of, the one whose weapons they report. */
function latestPlayedSetOf(
	sets: LobbyMatchRepository.LobbySetWithGames[],
	userId: number,
) {
	return sets.findLast((set) => LobbySet.sideOf(set, userId) !== null);
}

function viewerActions({
	lobby,
	sets,
	viewer,
	now,
	activeCount,
}: {
	lobby: LobbyRepository.LobbyById;
	sets: LobbyMatchRepository.LobbySetWithGames[];
	viewer: LobbyRepository.LobbyById["participants"][number];
	now: number;
	activeCount: number;
}) {
	const latestSet = sets.at(-1);
	const isPlaying = latestSet !== undefined && !LobbySet.isFinished(latestSet);

	return LobbyState.viewerActions({
		status: LobbyState.status({ lobby, isPlaying, now }),
		viewer,
		isPlayingUnfinishedSet: false,
		hasFriendCode: true,
		activeCount,
		roomSize: lobby.roomSize,
		now,
		startsAt: lobby.startsAt,
	});
}
