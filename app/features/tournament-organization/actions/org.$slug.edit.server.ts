import { type ActionFunctionArgs, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import { clearTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import { parseFormDataWithImages } from "~/form/parse.server";
import { getServerTFunction } from "~/modules/i18n/i18next.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { clampThemeToGamut } from "~/utils/oklch-gamut";
import { errorToastIfFalsy } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { tournamentOrganizationPage } from "~/utils/urls";
import * as TournamentOrganizationRepository from "../TournamentOrganizationRepository.server";
import { organizationEditActionSchema } from "../tournament-organization-schemas";
import { organizationFromParams } from "../tournament-organization-utils.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const user = requireUser();
	const result = await parseFormDataWithImages({
		request,
		schema: organizationEditActionSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const data = result.data;

	const organization = await organizationFromParams(params);

	requirePermission(organization, "EDIT");

	switch (data._action) {
		case "UPDATE_CUSTOM_THEME": {
			errorToastIfFalsy(
				organization.isEstablished,
				"Organization is not established",
			);

			await TournamentOrganizationRepository.updateCustomTheme({
				id: organization.id,
				customTheme: data.newValue ? clampThemeToGamut(data.newValue) : null,
			});

			return { ok: true };
		}
		case "EDIT": {
			if (
				!data.members.some(
					(member) => member.userId === user.id && member.role === "ADMIN",
				)
			) {
				const t = getServerTFunction(["org"]);

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

			// in case members changed...
			// 1) clear the participation info map (front page)
			ShowcaseTournaments.clearParticipationInfoMap();

			// 2) clear tournament data caches (so permission changes are shown immediately)
			await clearUnfinalizedEventCaches(organization.id);

			return redirect(
				tournamentOrganizationPage({ organizationSlug: newOrganization.slug }),
			);
		}
		default: {
			assertUnreachable(data);
		}
	}
};

async function clearUnfinalizedEventCaches(organizationId: number) {
	for (const tournament of await TournamentOrganizationRepository.findAllUnfinalizedEvents(
		organizationId,
	)) {
		clearTournamentDataCache(tournament.id);
	}
}
