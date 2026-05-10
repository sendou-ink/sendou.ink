import { type ActionFunction, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { parseFormData } from "~/form/parse.server";
import { requireRole } from "~/modules/permissions/guards.server";
import { errorToastIfFalsy } from "~/utils/remix.server";
import { tournamentOrganizationPage } from "~/utils/urls";
import * as TournamentOrganizationRepository from "../TournamentOrganizationRepository.server";
import { TOURNAMENT_ORGANIZATION } from "../tournament-organization-constants";
import { newOrganizationSchemaServer } from "../tournament-organization-schemas.server";

export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();
	requireRole("TOURNAMENT_ADDER");

	const result = await parseFormData({
		request,
		schema: newOrganizationSchemaServer,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const orgCount =
		await TournamentOrganizationRepository.countOrganizationsByUserId(user.id);

	errorToastIfFalsy(
		orgCount < TOURNAMENT_ORGANIZATION.MAX_MEMBER_OF_COUNT,
		`You are already a member of ${TOURNAMENT_ORGANIZATION.MAX_MEMBER_OF_COUNT} organizations. Leave one before creating a new one.`,
	);

	const org = await TournamentOrganizationRepository.create({
		name: result.data.name,
		ownerId: user.id,
	});

	return redirect(tournamentOrganizationPage({ organizationSlug: org.slug }));
};
