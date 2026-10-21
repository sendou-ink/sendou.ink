import * as LobbyRepository from "../LobbyRepository.server";

type ActiveParticipation = Awaited<
	ReturnType<typeof LobbyRepository.findAllActiveParticipants>
>[number];

let activeByUserId = await load();

/** The lobby the user is active in (present and not dropping), from memory. Kept fresh by `LobbyProgression.advance`. */
export function findByUserId(userId: number): ActiveParticipation | null {
	return activeByUserId.get(userId) ?? null;
}

/** Reloads who is active in which lobby from the database. */
export async function refresh() {
	activeByUserId = await load();
}

async function load() {
	const rows = await LobbyRepository.findAllActiveParticipants();

	return new Map(rows.map((row) => [row.userId, row]));
}
