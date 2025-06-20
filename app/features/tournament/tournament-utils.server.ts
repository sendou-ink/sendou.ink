import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { errorToast, errorToastIfFalsy } from "~/utils/remix.server";
import type { Tournament } from "../tournament-bracket/core/Tournament";

export const inGameNameIfNeeded = async ({
	tournament,
	userId,
}: {
	tournament: Tournament;
	userId: number;
}) => {
	if (!tournament.ctx.settings.requireInGameNames) return null;

	const inGameName = await UserRepository.inGameNameByUserId(userId);

	errorToastIfFalsy(inGameName, "No in-game name");

	return inGameName;
};

export async function requireNotBannedByOrganization({
	tournament,
	user,
	message = "You are banned from events hosted by this organization",
}: {
	tournament: Tournament;
	user: { id: number };
	message?: string;
}) {
	if (!tournament.ctx.organization) return;

	const isBanned =
		await TournamentOrganizationRepository.isUserBannedByOrganization({
			organizationId: tournament.ctx.organization.id,
			userId: user.id,
		});

	if (isBanned) {
		errorToast(message);
	}
}
