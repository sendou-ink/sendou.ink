import { type ActionFunctionArgs, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import { clearTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import { tournamentOrganizationPage } from "~/features/tournament-organization/tournament-organization-urls";
import { parseFormDataWithImages } from "~/form/parse.server";
import { getServerTFunction } from "~/modules/i18n/i18next.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import * as TournamentOrganizationRepository from "../TournamentOrganizationRepository.server";
import { organizationEditFormSchema } from "../tournament-organization-schemas";
import { organizationFromParams } from "../tournament-organization-utils.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const user = requireUser();
	const result = await parseFormDataWithImages({
		request,
		schema: organizationEditFormSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const data = result.data;

	const t = getServerTFunction(["org"]);

	const organization = await organizationFromParams(params);

	requirePermission(organization, "EDIT");

	if (
		!data.members.some(
			(member) => member.userId === user.id && member.role === "ADMIN",
		)
	) {
		return {
			fieldErrors: { members: t("org:edit.form.errors.noUnadmin") },
		};
	}

	const socials = data.socials.filter((s) => s.length > 0);

	const newOrganization = await TournamentOrganizationRepository.update({
		id: organization.id,
		name: data.name,
		description: data.description,
		socials: socials.length > 0 ? socials : null,
		avatarImgId: data.logo,
		members: data.members,
		series: data.series,
		badges: data.badges,
	});

	// members may have changed: clear the participation info map (front page)
	ShowcaseTournaments.clearParticipationInfoMap();

	// and tournament data caches so permission changes show immediately
	for (const tournament of await TournamentOrganizationRepository.findAllUnfinalizedEvents(
		organization.id,
	)) {
		clearTournamentDataCache(tournament.id);
	}

	return redirect(
		tournamentOrganizationPage({ organizationSlug: newOrganization.slug }),
	);
};
