import { type ActionFunction, redirect } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import { requireRole } from "~/modules/permissions/guards.server";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { tournamentOrganizationPage } from "~/utils/urls";
import * as TournamentOrganizationRepository from "../TournamentOrganizationRepository.server";
import { TOURNAMENT_ORGANIZATION } from "../tournament-organization-constants";
import { newOrganizationSchema } from "../tournament-organization-schemas";

export const action: ActionFunction = async ({ request }) => {
	const user = await requireUser(request);
	requireRole(user, "TOURNAMENT_ADDER");

	const data = await parseRequestPayload({
		request,
		schema: newOrganizationSchema,
	});

	const orgCount =
		await TournamentOrganizationRepository.countOrganizationsByUserId(user.id);

	errorToastIfFalsy(
		orgCount < TOURNAMENT_ORGANIZATION.MAX_MEMBER_OF_COUNT,
		`You are already a member of ${TOURNAMENT_ORGANIZATION.MAX_MEMBER_OF_COUNT} organizations. Leave one before creating a new one.`,
	);

	const org = await TournamentOrganizationRepository.create({
		name: data.name,
		ownerId: user.id,
	});

	return redirect(tournamentOrganizationPage({ organizationSlug: org.slug }));
};
