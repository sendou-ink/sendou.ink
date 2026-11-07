import { redirect } from "react-router";
import type * as v from "valibot";
import { visibilityIssues } from "~/features/associations/associations-schemas";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { notify } from "~/features/notifications/core/notify.server";
import { linkStoredMatches } from "~/features/scanner-ingest/core/relink.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as UserActivity from "~/features/user-activity/core/UserActivity.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { defineAction } from "~/form/define-action.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { hasPermission } from "~/modules/permissions/utils";
import { databaseTimestampNow, databaseTimestampToDate } from "~/utils/dates";
import {
	errorToast,
	errorToastIfFalsy,
	notFoundIfNullish,
} from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import { assertUnreachable } from "~/utils/types";
import { lobbiesPage } from "~/utils/urls";
import * as LobbyProgression from "../core/LobbyProgression.server";
import * as LobbySet from "../core/LobbySet";
import * as LobbyState from "../core/LobbyState";
import * as LobbyVoice from "../core/LobbyVoice.server";
import * as LobbyMatchRepository from "../LobbyMatchRepository.server";
import * as LobbyRepository from "../LobbyRepository.server";
import type { LobbyBestOf } from "../lobbies-constants";
import {
	LOBBY_VISIBILITY_ISSUE_MESSAGES,
	lobbyActionSchema,
} from "../lobbies-schemas";
import { lobbySearchParams } from "../lobbies-search-params";
import { visibilityFromForm } from "../lobbies-utils";
import { mapsFromForm } from "../lobbies-utils.server";

/** Actions changing what the lobbies list shows, see `LobbyCard`. */
const LISTING_ACTIONS = new Set<
	v.InferOutput<typeof lobbyActionSchema>["_action"]
>([
	"SIGN_UP",
	"CHECK_IN",
	"CONFIRM_READY",
	"LEAVE",
	"APPROVE_APPLICATION",
	"KICK",
	"MAKE_HOST",
	"UPDATE_SETTINGS",
	"UPDATE_MAPS",
	"UPDATE_VISIBILITY",
	"END_LOBBY",
]);

export const action = defineAction(
	{ params: idObject, body: lobbyActionSchema },
	async ({ params: { id }, body, request }) => {
		const user = requireUser();

		const lobby = notFoundIfNullish(
			await LobbyRepository.findById(id, {
				shareKey: lobbySearchParams.parse(request).key,
			}),
		);
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
		const autoAcceptedUserIds: number[] = [];
		const requireNoConflict = () =>
			errorToastIfConflict({ userId: user.id, lobbyId: id });

		switch (body._action) {
			case "SIGN_UP": {
				errorToastIfFalsy(!viewer, "Already signed up");
				errorToastIfFalsy(
					!lobby.isViewerKicked,
					"The host kicked you from this lobby",
				);
				errorToastIfFalsy(
					lobby.viewerApplication !== "DENIED",
					"The host denied your application to this lobby",
				);
				errorToastIfFalsy(
					await UserRepository.findCurrentFriendCodeByUserId(user.id),
					"Set your friend code first",
				);

				if (lobby.isApplicationRequired) {
					await LobbyRepository.insertApplication({
						lobbyId: id,
						userId: user.id,
					});
					if (lobby.viewerApplication === null) {
						void notify({
							userIds: [lobby.hostUserId],
							notification: {
								type: "LOBBY_APPLICATION_RECEIVED",
								meta: {
									lobbyId: id,
									lobbyName: lobby.name,
									applicantUsername: user.username,
								},
							},
						});
					}
					break;
				}

				await signUp({ lobby, userId: user.id, onConflict: "REJECT" });
				break;
			}
			case "WITHDRAW_APPLICATION": {
				await LobbyRepository.deletePendingApplication({
					lobbyId: id,
					userId: user.id,
				});
				break;
			}
			case "APPROVE_APPLICATION": {
				requirePermission(lobby, "MANAGE");
				const application = notFoundIfNullish(
					lobby.applications.find((candidate) => candidate.id === body.userId),
				);

				await acceptApplication({ lobby, userId: application.id });
				break;
			}
			case "DENY_APPLICATION": {
				requirePermission(lobby, "MANAGE");
				notFoundIfNullish(
					lobby.applications.find((candidate) => candidate.id === body.userId),
				);

				await LobbyRepository.denyApplication({
					lobbyId: id,
					userId: body.userId,
				});
				break;
			}
			case "CHECK_IN": {
				errorToastIfFalsy(viewer, "Not signed up");
				const actions = viewerActions({ lobby, sets, viewer, now });
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

				const setEnding = await LobbyRepository.removeParticipant({
					lobbyId: id,
					userId: user.id,
					unfinishedSetId: unfinishedSetIdOf(viewer),
				});
				if (lobby.chatRoomId) {
					void ChatSystemMessage.sendPersisted({
						roomId: lobby.chatRoomId,
						type: setEndingMessageType(setEnding) ?? "USER_LEFT_LOBBY",
						authorUserId: user.id,
					});
				}
				LobbyVoice.ejectLeavers({
					lobby: {
						chatRoomId: lobby.chatRoomId,
						participantUserIds: lobby.participants.map(
							(participant) => participant.id,
						),
					},
					latestSet: sets.at(-1),
					userIds: [user.id],
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
				if (lobby.chatRoomId) {
					void ChatSystemMessage.sendPersisted({
						roomId: lobby.chatRoomId,
						type: viewer.isDroppingAfterSet
							? "STAYING_AFTER_SET"
							: "LEAVING_AFTER_SET",
						authorUserId: user.id,
					});
				}
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
					isHost: hasPermission(lobby, "MANAGE", user),
				});
				if (result === "STALE") return null;
				if (result === "NOT_ALLOWED") return errorToast("Can't undo");
				break;
			}
			case "CONFIRM_SET": {
				const set = setOfLobby(body.setId);
				const result = await LobbyMatchRepository.confirmSet(set.id);
				if (result === "STALE") return null;
				if (result === "NOT_ALLOWED") return errorToast("Can't confirm");
				break;
			}
			case "DISPUTE_SET": {
				const set = setOfLobby(body.setId);
				const result = await LobbyMatchRepository.disputeSet(set.id);
				if (result === "STALE") return null;
				if (result === "NOT_ALLOWED") return errorToast("Can't dispute");
				break;
			}
			case "HOST_CONFIRM_SET": {
				requirePermission(lobby, "MANAGE");
				const set = setOfLobby(body.setId);
				const result = await LobbyMatchRepository.confirmDisputedSet(set.id);
				if (result === "STALE") return null;
				if (result === "NOT_ALLOWED") return errorToast("Can't confirm");
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
					weaponRandomizer: body.weaponRandomizer,
					isApplicationRequired: body.isApplicationRequired,
				});

				// anyone may join now, so those waiting on the host are let in
				if (!body.isApplicationRequired) {
					for (const application of lobby.applications) {
						await acceptApplication({
							lobby: notFoundIfNullish(await LobbyRepository.findById(id)),
							userId: application.id,
						});
						autoAcceptedUserIds.push(application.id);
					}
				}
				break;
			}
			case "UPDATE_MAPS": {
				requirePermission(lobby, "MANAGE");

				await LobbyRepository.updateMaps({
					id,
					...(await mapsFromForm(body)),
				});
				break;
			}
			case "UPDATE_VISIBILITY": {
				requirePermission(lobby, "MANAGE");
				const [issue] = visibilityIssues(body, {
					startsAt: databaseTimestampToDate(lobby.startsAt),
					isEdit: true,
					messages: LOBBY_VISIBILITY_ISSUE_MESSAGES,
				});
				if (issue) return { fieldErrors: { [issue.path[0]]: issue.message } };

				await LobbyRepository.updateVisibility({
					id,
					visibility: visibilityFromForm(body),
					ownerId: lobby.hostUserId,
				});
				break;
			}
			case "RESET_SHARE_KEY": {
				requirePermission(lobby, "MANAGE");

				await LobbyRepository.resetShareKey(id);
				break;
			}
			case "KICK": {
				requirePermission(lobby, "MANAGE");
				const target = lobby.participants.find(
					(participant) => participant.id === body.userId,
				);
				if (!target) {
					const leftUser = notFoundIfNullish(
						lobby.leftUsers.find((candidate) => candidate.id === body.userId),
					);

					await LobbyRepository.kickParticipant({
						lobbyId: id,
						userId: leftUser.id,
						unfinishedSetId: null,
					});
					break;
				}

				const setEnding = await LobbyRepository.kickParticipant({
					lobbyId: id,
					userId: target.id,
					unfinishedSetId: unfinishedSetIdOf(target),
				});
				sendSetEndingMessage({
					chatRoomId: lobby.chatRoomId,
					userId: target.id,
					setEnding,
				});
				LobbyVoice.ejectLeavers({
					lobby: {
						chatRoomId: lobby.chatRoomId,
						participantUserIds: lobby.participants.map(
							(participant) => participant.id,
						),
					},
					latestSet: sets.at(-1),
					userIds: [target.id],
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
			case "MAKE_HOST": {
				requirePermission(lobby, "MANAGE");
				const target = notFoundIfNullish(
					lobby.participants.find(
						(participant) => participant.id === body.userId,
					),
				);
				errorToastIfFalsy(
					target.id !== lobby.hostUserId,
					"They are already the host",
				);

				await LobbyRepository.update({ id, hostUserId: target.id });
				if (lobby.chatRoomId) {
					void ChatSystemMessage.sendPersisted({
						roomId: lobby.chatRoomId,
						type: "HOST_CHANGED",
						authorUserId: target.id,
					});
				}
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
			listingChanged: LISTING_ACTIONS.has(body._action),
			// joining or leaving the lobby changes their chat rooms, ending it makes everyone's inactive
			affectedUserIds:
				body._action === "KICK" || body._action === "APPROVE_APPLICATION"
					? [body.userId]
					: body._action === "SIGN_UP" || body._action === "LEAVE"
						? [user.id]
						: body._action === "END_LOBBY"
							? [...lobby.participants, ...lobby.leftUsers].map(
									(participant) => participant.id,
								)
							: autoAcceptedUserIds,
		});

		const isLobbyDeleted =
			body._action === "LEAVE" &&
			!(await LobbyRepository.findProgressionStateById(id));
		if (isLobbyDeleted) return redirect(lobbiesPage());

		return null;
	},
);

const CONFLICT_MESSAGES = {
	SENDOUQ: "Leave SendouQ before checking in to a lobby",
	TOURNAMENT: "You can't check in to a lobby while playing in a tournament",
	LOBBY: "Leave the other lobby before checking in to this one",
} as const;

function errorToastIfConflict({
	userId,
	lobbyId,
}: {
	userId: number;
	lobbyId: number;
}) {
	const conflict = UserActivity.lobbyConflict(
		UserActivity.resolve(userId),
		lobbyId,
	);
	if (conflict) errorToast(CONFLICT_MESSAGES[conflict]);
}

/**
 * Makes a participant of the user, as signing up or the host approving their application does. Before the start
 * they get a spot if one is free, else they're waitlisted. After it, with check-in open, they're present right away
 * if the room has space, the sign-up opening check-in counting too.
 */
async function signUp({
	lobby,
	userId,
	onConflict,
}: {
	lobby: LobbyRepository.LobbyById;
	userId: number;
	/** What happens when they'd be present right away but are active elsewhere (e.g. SendouQ): `REJECT` errors out, `SIGN_UP_ABSENT` signs them up without checking them in */
	onConflict: "REJECT" | "SIGN_UP_ABSENT";
}) {
	const now = databaseTimestampNow();
	const hasStarted = now >= lobby.startsAt;

	const withSpotCount = lobby.participants.filter(
		(participant) => participant.status !== "WAITLISTED",
	).length;
	const isLate =
		hasStarted &&
		LobbyState.isCheckInOpen({
			lobby,
			participants: [...lobby.participants, { status: "REGISTERED" }],
			now,
		});

	let isPresentRightAway = isLate && activeCountOf(lobby) < lobby.roomSize;
	if (isPresentRightAway && onConflict === "REJECT") {
		errorToastIfConflict({ userId, lobbyId: lobby.id });
	} else if (isPresentRightAway) {
		isPresentRightAway =
			UserActivity.lobbyConflict(UserActivity.resolve(userId), lobby.id) ===
			null;
	}

	await LobbyRepository.insertParticipant({
		lobbyId: lobby.id,
		userId,
		status: isPresentRightAway
			? "CHECKED_IN"
			: !isLate && withSpotCount < lobby.roomSize
				? "REGISTERED"
				: "WAITLISTED",
	});
	if (isPresentRightAway) {
		await LobbyMatchRepository.confirmReadyChecks({
			lobbyId: lobby.id,
			userId,
		});
	}
	if (hasStarted && lobby.chatRoomId) {
		void ChatSystemMessage.sendPersisted({
			roomId: lobby.chatRoomId,
			type: "USER_JOINED",
			authorUserId: userId,
		});
	}
}

/** Signs the applicant up as {@link signUp} would, even if busy elsewhere, and tells them they got in. */
async function acceptApplication({
	lobby,
	userId,
}: {
	lobby: LobbyRepository.LobbyById;
	userId: number;
}) {
	await signUp({ lobby, userId, onConflict: "SIGN_UP_ABSENT" });
	void notify({
		userIds: [userId],
		notification: {
			type: "LOBBY_APPLICATION_APPROVED",
			meta: { lobbyId: lobby.id, lobbyName: lobby.name },
		},
	});
}

/** Participants present: checked in or in the room. */
function activeCountOf(lobby: LobbyRepository.LobbyById) {
	return lobby.participants.filter(
		(participant) =>
			participant.status === "IN_ROOM" || participant.status === "CHECKED_IN",
	).length;
}

function sendSetEndingMessage({
	chatRoomId,
	userId,
	setEnding,
}: {
	chatRoomId: number | null;
	userId: number;
	setEnding: LobbyMatchRepository.LeftSetEnding | null;
}) {
	const type = setEndingMessageType(setEnding);
	if (!chatRoomId || !type) return;

	void ChatSystemMessage.sendPersisted({
		roomId: chatRoomId,
		type,
		authorUserId: userId,
	});
}

function setEndingMessageType(
	setEnding: LobbyMatchRepository.LeftSetEnding | null,
) {
	if (setEnding === "FORFEITED") return "SET_FORFEITED";
	if (setEnding === "CALLED_OFF") return "SET_CALLED_OFF";

	return null;
}

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
}: {
	lobby: LobbyRepository.LobbyById;
	sets: LobbyMatchRepository.LobbySetWithGames[];
	viewer: LobbyRepository.LobbyById["participants"][number];
	now: number;
}) {
	const latestSet = sets.at(-1);
	const isPlaying = latestSet !== undefined && !LobbySet.isFinished(latestSet);

	const { status, isCheckInOpen } = LobbyState.statusAndCheckIn({
		lobby,
		participants: lobby.participants,
		isPlaying,
		now,
	});

	return LobbyState.viewerActions({
		status,
		viewer,
		isPlayingUnfinishedSet: false,
		hasFriendCode: true,
		isKicked: lobby.isViewerKicked,
		application: lobby.viewerApplication,
		isCheckInOpen,
		activeCount: activeCountOf(lobby),
		roomSize: lobby.roomSize,
		now,
		startsAt: lobby.startsAt,
	});
}
