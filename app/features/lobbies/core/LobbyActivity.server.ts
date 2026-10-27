/**
 * In-memory index of the lobby each user is active in, read through `UserActivity`: shown to friends
 * and checked so a user isn't in SendouQ or a tournament at the same time. Also who a lobby's ready check
 * is waiting on, for their header status.
 */
import * as LobbyRepository from "../LobbyRepository.server";

type ActiveParticipation = Awaited<
	ReturnType<typeof LobbyRepository.findAllActiveParticipants>
>[number];

let index = await load();

/** The lobby the user is active in (present and not dropping), from memory. Kept fresh by `LobbyProgression.advance`. */
export function findByUserId(userId: number): ActiveParticipation | null {
	return index.activeByUserId.get(userId) ?? null;
}

/** Id of the lobby whose open ready check asks the user to confirm they're ready, from memory. */
export function findReadyCheckLobbyIdByUserId(userId: number): number | null {
	return index.readyCheckLobbyIdByUserId.get(userId) ?? null;
}

/** Reloads who is active in which lobby from the database. */
export async function refresh() {
	index = await load();
}

async function load() {
	const activeRows = await LobbyRepository.findAllActiveParticipants();
	const readyCheckRows =
		await LobbyRepository.findAllUnconfirmedReadyCheckUsers();

	return {
		activeByUserId: new Map(activeRows.map((row) => [row.userId, row])),
		readyCheckLobbyIdByUserId: new Map(
			readyCheckRows.map((row) => [row.userId, row.lobbyId]),
		),
	};
}
