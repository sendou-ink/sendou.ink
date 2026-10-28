import { redirect } from "react-router";
import * as Visibility from "~/features/associations/core/Visibility";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserActivity from "~/features/user-activity/core/UserActivity.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { defineAction } from "~/form/define-action.server";
import { requireRole } from "~/modules/permissions/guards.server";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import { errorToastIfFalsy } from "~/utils/remix.server";
import { lobbyPage } from "~/utils/urls";
import * as LobbyProgression from "../core/LobbyProgression.server";
import * as LobbyState from "../core/LobbyState";
import * as LobbyRepository from "../LobbyRepository.server";
import type { LobbyBestOf, LobbyRoomSize } from "../lobbies-constants";
import { newLobbySchema } from "../lobbies-schemas";

export const action = defineAction(
	{ body: newLobbySchema },
	async ({ body }) => {
		const user = requireUser();
		requireRole("LOBBY_ADDER");

		errorToastIfFalsy(
			await UserRepository.findCurrentFriendCodeByUserId(user.id),
			"Set your friend code first",
		);

		const startsAt = dateToDatabaseTimestamp(body.startsAt);
		// a lobby starting about now has its host present already
		const isHostPresent =
			databaseTimestampNow() >= LobbyState.checkInOpensAt(startsAt) &&
			!UserActivity.lobbyConflict(UserActivity.resolve(user.id));

		const lobbyId = await LobbyRepository.insert({
			hostUserId: user.id,
			name: body.name ?? `${user.username}'s lobby`,
			description: body.description,
			label: body.label,
			startsAt,
			bestOf: Number(body.bestOf) as LobbyBestOf,
			modes: body.modes,
			roomSize: Number(body.roomSize) as LobbyRoomSize,
			visibility:
				body.baseVisibility === "LINK_ONLY"
					? "LINK_ONLY"
					: Visibility.fromForm({
							baseVisibility: body.baseVisibility,
							notFoundVisibility: body.notFoundVisibility,
						}),
			hostStatus: isHostPresent ? "CHECKED_IN" : "REGISTERED",
		});

		await LobbyProgression.advance(lobbyId, { hasChanged: true });

		return redirect(lobbyPage(lobbyId));
	},
);
