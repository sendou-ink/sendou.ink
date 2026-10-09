import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { tournamentOrganizationPage } from "~/features/tournament-organization/tournament-organization-urls";
import { defineAction } from "~/form/define-action.server";
import { requireRole } from "~/modules/permissions/guards.server";
import { errorToastIfFalsy } from "~/utils/remix.server";
import * as TournamentOrganizationRepository from "../TournamentOrganizationRepository.server";
import { TOURNAMENT_ORGANIZATION } from "../tournament-organization-constants";
import { newOrganizationSchemaServer } from "../tournament-organization-schemas.server";

export const action = defineAction(
	{ body: newOrganizationSchemaServer },
	async ({ body }) => {
		const user = requireUser();
		requireRole("TOURNAMENT_ADDER");

		const orgCount =
			await TournamentOrganizationRepository.countOrganizationsByUserId(
				user.id,
			);

		errorToastIfFalsy(
			orgCount < TOURNAMENT_ORGANIZATION.MAX_MEMBER_OF_COUNT,
			`You are already a member of ${TOURNAMENT_ORGANIZATION.MAX_MEMBER_OF_COUNT} organizations. Leave one before creating a new one.`,
		);

		const org = await TournamentOrganizationRepository.insert({
			name: body.name,
			ownerId: user.id,
		});

		return redirect(tournamentOrganizationPage({ organizationSlug: org.slug }));
	},
);
