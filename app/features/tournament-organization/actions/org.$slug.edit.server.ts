import { type ActionFunctionArgs, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import { clearTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import { parseFormData } from "~/form/parse.server";
import { i18next } from "~/modules/i18n/i18next.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { actionError } from "~/utils/remix.server";
import { tournamentOrganizationPage } from "~/utils/urls";
import * as TournamentOrganizationRepository from "../TournamentOrganizationRepository.server";
import { organizationEditFormSchema } from "../tournament-organization-schemas";
import { organizationFromParams } from "../tournament-organization-utils.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const user = requireUser();
	const result = await parseFormData({
		request,
		schema: organizationEditFormSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const data = result.data;

	const t = await i18next.getFixedT(request, ["org"]);

	const organization = await organizationFromParams(params);

	requirePermission(organization, "EDIT");

	if (
		!data.members.some(
			(member) => member.userId === user.id && member.role === "ADMIN",
		)
	) {
		return actionError<typeof organizationEditFormSchema>({
			msg: t("org:edit.form.errors.noUnadmin"),
			field: "members.root",
		});
	}

	const socials = data.socials.filter((s) => s.length > 0);

	const newOrganization = await TournamentOrganizationRepository.update({
		id: organization.id,
		name: data.name,
		description: data.description,
		socials: socials.length > 0 ? socials : null,
		members: data.members,
		series: data.series,
		badges: data.badges,
	});

	// in case members changed...
	// 1) clear the participation info map (front page)
	ShowcaseTournaments.clearParticipationInfoMap();

	// 2) clear tournament data caches (so permission changes are shown immediately)
	for (const tournament of await TournamentOrganizationRepository.findAllUnfinalizedEvents(
		organization.id,
	)) {
		clearTournamentDataCache(tournament.id);
	}

	return redirect(
		tournamentOrganizationPage({ organizationSlug: newOrganization.slug }),
	);
};
