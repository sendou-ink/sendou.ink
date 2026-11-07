import type { LoaderFunctionArgs } from "react-router";
import * as AssociationRepository from "~/features/associations/AssociationRepository.server";
import * as Visibility from "~/features/associations/core/Visibility";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { databaseTimestampNow } from "~/utils/dates";
import { notFoundIfNullish } from "~/utils/remix.server";
import * as LobbyRepository from "../LobbyRepository.server";
import { newLobbySearchParams } from "../lobbies-search-params";
import { mapsFormValues } from "../lobbies-utils";

export const loader = async ({ url }: LoaderFunctionArgs) => {
	const user = requireUser();
	const { lobbyId } = newLobbySearchParams.parse(url);

	const associations = await AssociationRepository.findByMemberUserId(user.id);
	const hasFriendCode = Boolean(
		await UserRepository.findCurrentFriendCodeByUserId(user.id),
	);

	if (lobbyId === null) {
		return { associations, hasFriendCode, lobbyToEdit: null };
	}

	const lobby = notFoundIfNullish(await LobbyRepository.findById(lobbyId));
	requirePermission(lobby, "MANAGE");

	const visibilityRows = await LobbyRepository.findVisibilityRowsById(lobby.id);

	return {
		associations: Visibility.withAudiencesOf(associations, visibilityRows),
		hasFriendCode,
		lobbyToEdit: {
			id: lobby.id,
			name: lobby.name,
			description: lobby.description,
			label: lobby.label,
			bestOf: lobby.bestOf,
			maps: mapsFormValues(lobby),
			weaponRandomizer: lobby.weaponRandomizer,
			isApplicationRequired: lobby.isApplicationRequired,
			hasStarted: databaseTimestampNow() >= lobby.startsAt,
			visibility: lobby.isLinkOnly
				? {
						baseVisibility: "LINK_ONLY" as const,
						notFoundVisibility: { at: null, forAssociation: "PUBLIC" as const },
					}
				: Visibility.toForm(visibilityRows),
		},
	};
};
