import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { parseFormDataWithImages } from "~/form/parse.server";
import { clampThemeToGamut } from "~/utils/oklch-gamut";
import { errorToastIfFalsy, notFoundIfFalsy } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { mySlugify, teamPage } from "~/utils/urls";
import * as TeamRepository from "../TeamRepository.server";
import { editTeamActionSchema, teamParamsSchema } from "../team-schemas.server";
import { canAddCustomizedColors, isTeamManager } from "../team-utils";

export const action: ActionFunction = async ({ request, params }) => {
	const user = requireUser();
	const { customUrl } = teamParamsSchema.parse(params);

	const team = notFoundIfFalsy(await TeamRepository.findByCustomUrl(customUrl));

	errorToastIfFalsy(
		isTeamManager({ team, user }) || user.roles.includes("ADMIN"),
		"You are not a team manager",
	);

	const result = await parseFormDataWithImages({
		request,
		schema: editTeamActionSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const data = result.data;

	switch (data._action) {
		case "UPDATE_CUSTOM_THEME": {
			errorToastIfFalsy(
				canAddCustomizedColors(team),
				"Team does not have custom theme access",
			);

			await TeamRepository.updateCustomTheme({
				id: team.id,
				customTheme: data.newValue ? clampThemeToGamut(data.newValue) : null,
			});

			return { ok: true };
		}
		case "EDIT": {
			const newCustomUrl = mySlugify(data.name);
			const teams = await TeamRepository.findAllUndisbanded();
			const duplicateTeam = teams.find(
				(t) => t.customUrl === newCustomUrl && t.customUrl !== team.customUrl,
			);

			if (duplicateTeam) {
				return { fieldErrors: { name: "forms:errors.duplicateName" } };
			}

			const updatedTeam = await TeamRepository.update({
				id: team.id,
				name: data.name,
				bio: data.bio,
				bsky: data.bsky,
				tag: data.tag,
				avatarImgId: data.logo,
				bannerImgId: data.banner,
			});

			throw redirect(teamPage(updatedTeam.customUrl));
		}
		default: {
			assertUnreachable(data);
		}
	}
};
