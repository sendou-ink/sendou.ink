import { isAdmin } from "~/permissions";
import type { UnwrappedNonNullable } from "~/utils/types";
import type * as TournamentOrganizationRepository from "./TournamentOrganizationRepository.server";

export function canEditTournamentOrganization({
	user,
	organization,
}: {
	user?: { id: number };
	organization: Pick<
		UnwrappedNonNullable<typeof TournamentOrganizationRepository.findBySlug>,
		"members"
	>;
}) {
	if (isAdmin(user)) {
		return true;
	}

	return organization.members.some(
		(member) => member.id === user?.id && member.role === "ADMIN",
	);
}
