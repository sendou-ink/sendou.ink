import { type ActionFunctionArgs, redirect } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import i18next from "~/modules/i18n/i18next.server";
import { valueArrayToDBFormat } from "~/utils/form";
import {
	actionError,
	parseRequestPayload,
	unauthorizedIfFalsy,
} from "~/utils/remix.server";
import { tournamentOrganizationPage } from "~/utils/urls";
import * as TournamentOrganizationRepository from "../TournamentOrganizationRepository.server";
import { organizationEditSchema } from "../routes/org.$slug.edit";
import { canEditTournamentOrganization } from "../tournament-organization-utils";
import { organizationFromParams } from "../tournament-organization-utils.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: organizationEditSchema,
	});
	const t = await i18next.getFixedT(request, ["org"]);

	const organization = await organizationFromParams(params);

	unauthorizedIfFalsy(canEditTournamentOrganization({ organization, user }));

	if (
		!data.members.some(
			(member) => member.userId === user.id && member.role === "ADMIN",
		)
	) {
		return actionError<typeof organizationEditSchema>({
			msg: t("org:edit.form.errors.noUnadmin"),
			field: "members.root",
		});
	}

	const newOrganization = await TournamentOrganizationRepository.update({
		id: organization.id,
		name: data.name,
		description: data.description,
		socials: valueArrayToDBFormat(data.socials),
		members: data.members,
		series: data.series,
		badges: data.badges,
	});

	// in case members changed
	ShowcaseTournaments.clearParticipationInfoMap();

	return redirect(
		tournamentOrganizationPage({ organizationSlug: newOrganization.slug }),
	);
};
