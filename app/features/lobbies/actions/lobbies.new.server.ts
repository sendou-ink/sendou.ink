import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { defineAction } from "~/form/define-action.server";
import { requireRole } from "~/modules/permissions/guards.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { errorToastIfFalsy } from "~/utils/remix.server";
import { lobbyPage } from "~/utils/urls";
import * as LobbyProgression from "../core/LobbyProgression.server";
import * as LobbyRepository from "../LobbyRepository.server";
import {
	type LobbyBestOf,
	type LobbyRoomSize,
	PLAYERS_PER_SET,
} from "../lobbies-constants";
import { newLobbySchema } from "../lobbies-schemas";
import { visibilityFromForm } from "../lobbies-utils";

export const action = defineAction(
	{ body: newLobbySchema },
	async ({ body }) => {
		const user = requireUser();
		requireRole("LOBBY_ADDER");

		errorToastIfFalsy(
			await UserRepository.findCurrentFriendCodeByUserId(user.id),
			"Set your friend code first",
		);

		const lobbyId = await LobbyRepository.insert({
			hostUserId: user.id,
			name: body.name ?? `${user.username}'s lobby`,
			description: body.description,
			label: body.label,
			startsAt: dateToDatabaseTimestamp(body.startsAt),
			bestOf: Number(body.bestOf) as LobbyBestOf,
			modes: body.modes,
			weaponRandomizer: body.weaponRandomizer,
			roomSize: (PLAYERS_PER_SET + Number(body.spectators)) as LobbyRoomSize,
			visibility: visibilityFromForm(body),
		});

		await LobbyProgression.advance(lobbyId, { hasChanged: true });

		return redirect(lobbyPage(lobbyId));
	},
);
