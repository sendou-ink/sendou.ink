import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import { parseFormDataWithImages } from "~/form/parse.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { clampThemeToGamut } from "~/utils/oklch-gamut";
import { errorToastIfFalsy, notFoundIfNullish } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { mySlugify, teamPage } from "~/utils/urls";
import * as TeamRepository from "../TeamRepository.server";
import { editTeamActionSchema } from "../team-schemas";
import { teamParamsSchema } from "../team-schemas.server";
import { canAddCustomizedColors } from "../team-utils";

export const action: ActionFunction = async ({ request, params }) => {
	requireUser();
	const { customUrl } = v.parse(teamParamsSchema, params);

	const team = notFoundIfNullish(
		await TeamRepository.findByCustomUrl(customUrl),
	);

	requirePermission(team, "EDIT");

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
		case "UPDATE_MAP_MODE_PREFERENCES": {
			await TeamRepository.updateMapModePreferences({
				id: team.id,
				mapModePreferences: data.mapModePreferences,
			});

			return { ok: true };
		}
		case "REMOVE_MAP_MODE_PREFERENCES": {
			await TeamRepository.updateMapModePreferences({
				id: team.id,
				mapModePreferences: null,
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
