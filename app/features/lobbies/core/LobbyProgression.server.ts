import { addMinutes } from "date-fns";
import * as R from "remeda";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as MatchProfileRepository from "~/features/match-profile/MatchProfileRepository.server";
import { notify } from "~/features/notifications/core/notify.server";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import { logger } from "~/utils/logger";
import { assertUnreachable } from "~/utils/types";
import * as LobbyMatchRepository from "../LobbyMatchRepository.server";
import * as LobbyRepository from "../LobbyRepository.server";
import { SLOT_FILL_PRIORITY_MINUTES } from "../lobbies-constants";
import { lobbyChannel } from "../lobbies-utils";
import * as LobbyActivity from "./LobbyActivity.server";
import * as LobbyMapList from "./LobbyMapList.server";
import * as LobbyRating from "./LobbyRating";
import * as LobbySet from "./LobbySet";
import * as LobbyTransition from "./LobbyTransition";
import * as PlayerRoles from "./PlayerRoles";
import * as TeamShuffle from "./TeamShuffle";

/** Upper bound of transitions applied in one go, a backstop against a transition that doesn't settle. */
const MAX_TRANSITIONS = 50;

/** Timestamps are in seconds, so a moment after the deadline the check has surely run out. */
const ADVANCE_AT_MARGIN_MS = 1_500;

const queues = new Map<number, Promise<void>>();

/**
 * The only place lobby transitions happen. Loads the lobby, asks `LobbyTransition` what is due next and applies
 * it, until nothing is: starting the lobby, shuffling after a confirmed set, filling the room, ready checks,
 * applying drops, passing on the host and auto-closing. Then publishes the change to the lobby's page
 * and sends the notifications. Idempotent: called after every lobby action and by a routine, so a missed call
 * is fixed by the next one. Calls for the same lobby run one at a time.
 *
 * @param hasChanged the caller already changed the lobby (e.g. reported a map), publish even if nothing else happens
 * @param affectedUserIds users the caller's change concerns who may not be participants anymore, e.g. who left
 */
export function advance(
	lobbyId: number,
	{
		hasChanged = false,
		affectedUserIds = [],
	}: { hasChanged?: boolean; affectedUserIds?: number[] } = {},
): Promise<void> {
	const previous = queues.get(lobbyId) ?? Promise.resolve();
	const current = previous
		.then(() => advanceNow({ lobbyId, hasChanged, affectedUserIds }))
		.catch((error) => {
			logger.error(`Advancing lobby ${lobbyId} failed`, error);
		});

	queues.set(lobbyId, current);
	void current.finally(() => {
		if (queues.get(lobbyId) === current) queues.delete(lobbyId);
	});

	return current;
}

interface Effects {
	/** Users whose chat rooms may have changed */
	roomsChangedUserIds: Set<number>;
	notifications: Array<Parameters<typeof notify>[0]>;
}

async function advanceNow({
	lobbyId,
	hasChanged,
	affectedUserIds,
}: {
	lobbyId: number;
	hasChanged: boolean;
	affectedUserIds: number[];
}) {
	const effects: Effects = {
		roomsChangedUserIds: new Set(affectedUserIds),
		notifications: [],
	};
	let appliedCount = 0;
	let participantUserIds = affectedUserIds;

	for (; appliedCount < MAX_TRANSITIONS; appliedCount++) {
		const loaded = await loadState(lobbyId);
		if (!loaded) break;

		participantUserIds = R.unique([
			...participantUserIds,
			...loaded.state.participants.map((p) => p.userId),
		]);

		const transition = LobbyTransition.next(
			loaded.state,
			databaseTimestampNow(),
		);
		if (!transition) break;

		await apply({ transition, loaded, effects });
	}

	if (appliedCount === MAX_TRANSITIONS) {
		logger.error(
			`Lobby ${lobbyId} didn't settle in ${MAX_TRANSITIONS} transitions`,
		);
	}

	if (appliedCount === 0 && !hasChanged) return;

	await LobbyActivity.refresh();

	ChatSystemMessage.send({ channel: lobbyChannel(lobbyId) });
	ChatSystemMessage.notifyRoomsChanged([...effects.roomsChangedUserIds]);
	ChatSystemMessage.notifyStatusChanged(participantUserIds);

	for (const notification of effects.notifications) {
		void notify(notification);
	}
}

type LoadedState = NonNullable<Awaited<ReturnType<typeof loadState>>>;

async function loadState(lobbyId: number) {
	const lobby = await LobbyRepository.findProgressionStateById(lobbyId);
	if (!lobby) return null;

	const sets = await LobbyMatchRepository.findAllSetsByLobbyId(lobbyId);
	const latestSet = sets.at(-1);

	const state: LobbyTransition.ProgressionState = {
		lobby: {
			hostUserId: lobby.hostUserId,
			startsAt: lobby.startsAt,
			roomSize: lobby.roomSize,
			pendingSince: lobby.pendingSince,
			endedAt: lobby.endedAt,
		},
		participants: lobby.participants.map((participant) => ({
			userId: participant.userId,
			status: participant.status,
			joinedAt: participant.joinedAt,
			isDroppingAfterSet: Boolean(participant.isDroppingAfterSet),
			isSittingOut: Boolean(participant.isSittingOut),
		})),
		latestSet: latestSet
			? {
					...latestSet,
					lastActivityAt: Math.max(
						latestSet.createdAt,
						...latestSet.games.map((game) => game.reportedAt ?? 0),
					),
				}
			: null,
		readyChecks: lobby.readyChecks,
	};

	return { lobby, state, sets };
}

async function apply({
	transition,
	loaded,
	effects,
}: {
	transition: LobbyTransition.Transition;
	loaded: LoadedState;
	effects: Effects;
}) {
	const { lobby, state } = loaded;
	const lobbyMeta = { lobbyId: lobby.id, lobbyName: lobby.name };
	const allUserIds = state.participants.map((p) => p.userId);
	const roomsChanged = (userIds: number[]) => {
		for (const userId of userIds) effects.roomsChangedUserIds.add(userId);
	};

	switch (transition.type) {
		case "END": {
			await LobbyRepository.end(lobby.id);
			roomsChanged(allUserIds);
			break;
		}
		case "TRANSFER_HOST": {
			await LobbyRepository.update({
				id: lobby.id,
				hostUserId: transition.userId,
			});
			effects.notifications.push({
				userIds: [transition.userId],
				notification: { type: "LOBBY_HOST", meta: lobbyMeta },
			});
			break;
		}
		case "PROMOTE": {
			await LobbyRepository.updateParticipantsStatus({
				lobbyId: lobby.id,
				userIds: transition.userIds,
				status: "REGISTERED",
			});
			effects.notifications.push({
				userIds: transition.userIds,
				notification: { type: "LOBBY_PROMOTED", meta: lobbyMeta },
			});
			break;
		}
		case "START": {
			await LobbyRepository.updateParticipantsStatus({
				lobbyId: lobby.id,
				userIds: transition.userIds,
				status: "IN_ROOM",
			});
			effects.notifications.push({
				userIds: transition.userIds,
				notification: { type: "LOBBY_STARTED", meta: lobbyMeta },
			});
			roomsChanged(transition.userIds);
			break;
		}
		case "REMOVE": {
			await LobbyRepository.deleteParticipants({
				lobbyId: lobby.id,
				userIds: transition.userIds,
			});
			roomsChanged(transition.userIds);
			break;
		}
		case "START_SET": {
			await startSet(loaded);
			roomsChanged(allUserIds);
			break;
		}
		case "OPEN_SLOT_CHECK": {
			const waitlist = LobbyTransition.waitlist(state);
			const priorityEndsAt = addMinutes(new Date(), SLOT_FILL_PRIORITY_MINUTES);
			await LobbyMatchRepository.insertReadyCheck({
				lobbyId: lobby.id,
				expiresAt: dateToDatabaseTimestamp(priorityEndsAt),
				userIds: waitlist,
			});
			advanceAt(lobby.id, priorityEndsAt);
			effects.notifications.push({
				userIds: waitlist,
				notification: { type: "LOBBY_READY_CHECK", meta: lobbyMeta },
			});
			break;
		}
		case "FILL_SLOTS": {
			await LobbyRepository.updateParticipantsStatus({
				lobbyId: lobby.id,
				userIds: transition.userIds,
				status: "IN_ROOM",
			});
			effects.notifications.push({
				userIds: transition.userIds,
				notification: { type: "LOBBY_PROMOTED", meta: lobbyMeta },
			});
			break;
		}
		case "CLOSE_CHECK": {
			await LobbyMatchRepository.deleteReadyCheck(transition.readyCheckId);
			break;
		}
		case "SET_PENDING_SINCE": {
			await LobbyRepository.update({
				id: lobby.id,
				pendingSince: transition.pendingSince,
			});
			break;
		}
		default: {
			assertUnreachable(transition);
		}
	}
}

/** A ready check running out is decided right away, not only on the routine's next run. */
function advanceAt(lobbyId: number, at: Date) {
	const timeout = setTimeout(
		() => void advance(lobbyId),
		at.getTime() - Date.now() + ADVANCE_AT_MARGIN_MS,
	);
	timeout.unref?.();
}

/** Shuffles the room's members not sitting out into teams for the next set and generates its maps. */
async function startSet({ lobby, sets }: LoadedState) {
	const members = lobby.participants.filter(
		(p) => p.status === "IN_ROOM" && !p.isSittingOut,
	);
	const userIds = members.map((member) => member.userId);

	const finishedSets = sets.filter(LobbySet.isFinished);
	const ratings = LobbyRating.ratings(finishedSets);
	const profiles = await MatchProfileRepository.findAllByUserIds(userIds);
	const profileOf = (userId: number) =>
		profiles.find((profile) => profile.userId === userId);

	const previousSet = sets.at(-1);
	const history = TeamShuffle.teammateHistory(
		finishedSets.map((set) => ({
			alpha: LobbySet.playersOf(set, "ALPHA"),
			bravo: LobbySet.playersOf(set, "BRAVO"),
		})),
	);

	const result = TeamShuffle.shuffle({
		players: members.map((member) => ({
			userId: member.userId,
			rating: LobbyRating.ratingOf(ratings, member.userId),
			roles: PlayerRoles.fromWeaponPool(
				profileOf(member.userId)?.weaponPool ?? [],
			),
			sitOutCount: sets.filter((set) =>
				set.participants.some(
					(participant) =>
						participant.userId === member.userId && participant.side === null,
				),
			).length,
			satOutPreviousSet: previousSet
				? previousSet.participants.some(
						(participant) =>
							participant.userId === member.userId && participant.side === null,
					)
				: false,
		})),
		history,
	});

	const preferencesOf = (team: number[]) =>
		team.map((userId) => ({
			userId,
			preferences: profileOf(userId)?.mapModePreferences ?? null,
		}));

	const maps = await LobbyMapList.generate({
		alpha: preferencesOf(result.alpha),
		bravo: preferencesOf(result.bravo),
		modes: lobby.modes,
		bestOf: lobby.bestOf,
	});

	await LobbyMatchRepository.insertSet({
		lobbyId: lobby.id,
		bestOf: lobby.bestOf,
		maps,
		...result,
	});
}
