import * as R from "remeda";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";

/**
 * Organizations the user may create a calendar event or tournament under: those they administer or organize for,
 * only established ones unless they are a tournament adder, who may also create one without an organization (`"NO_ORG"`).
 */
export async function findValidOrganizations(
	userId: number,
	isTournamentAdder: boolean,
) {
	const orgs = await TournamentOrganizationRepository.findByUserId(userId, {
		roles: ["ADMIN", "ORGANIZER"],
	});

	if (isTournamentAdder) {
		return [
			"NO_ORG",
			...orgs.map((org) =>
				R.omit(org, ["isEstablished", "role", "roleDisplayName"]),
			),
		];
	}

	return orgs
		.filter((org) => org.isEstablished)
		.map((org) => R.omit(org, ["isEstablished", "role", "roleDisplayName"]));
}
