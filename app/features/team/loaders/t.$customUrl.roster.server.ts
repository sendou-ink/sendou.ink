import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { notFoundIfNullish } from "~/utils/remix.server";
import { teamPage } from "~/utils/urls";
import * as TeamRepository from "../TeamRepository.server";
import { teamParamsSchema } from "../team-schemas.server";
import { isTeamManager } from "../team-utils";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = requireUser();
	const { customUrl } = teamParamsSchema.parse(params);

	const team = notFoundIfNullish(
		await TeamRepository.findByCustomUrl(customUrl, {
			includeInviteCode: true,
		}),
	);

	if (!isTeamManager({ team, user }) && !user.roles.includes("ADMIN")) {
		throw redirect(teamPage(customUrl));
	}

	return {
		team,
	};
};
