import type * as LobbyRepository from "../LobbyRepository.server";

type EditArgs = Parameters<typeof LobbyRepository.edit>[0];

/** `LobbyRepository.edit` args of a public lobby with `LobbyFactory`'s default settings, overridden by the given ones. */
export function editArgs({
	id,
	ownerId,
	...overrides
}: Pick<EditArgs, "id" | "ownerId"> & Partial<EditArgs>): EditArgs {
	return {
		id,
		ownerId,
		name: "Lobby",
		description: null,
		label: "CASUAL",
		bestOf: 3,
		weaponRandomizer: "OFF",
		isApplicationRequired: false,
		modes: ["SZ", "TC", "RM", "CB"],
		mapPool: null,
		mapsTournamentId: null,
		visibility: null,
		...overrides,
	};
}
