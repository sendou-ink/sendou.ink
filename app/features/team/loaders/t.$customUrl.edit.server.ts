import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { hasPermission } from "~/modules/permissions/utils";
import { notFoundIfNullish } from "~/utils/remix.server";
import { teamPage } from "~/utils/urls";
import * as TeamRepository from "../TeamRepository.server";
import { teamParamsSchema } from "../team-schemas.server";
import { canAddCustomizedColors } from "../team-utils";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = requireUser();
	const { customUrl } = teamParamsSchema.parse(params);

	const team = notFoundIfNullish(
		await TeamRepository.findByCustomUrl(customUrl, {
			includeUnvalidatedImages: true,
		}),
	);

	if (!hasPermission(team, "EDIT", user)) {
		throw redirect(teamPage(customUrl));
	}

	return {
		team,
		customTheme: canAddCustomizedColors(team) ? team.customTheme : null,
		canAddCustomizedColors: canAddCustomizedColors(team),
	};
};
