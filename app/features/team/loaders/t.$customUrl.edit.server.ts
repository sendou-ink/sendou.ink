import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import { notFoundIfFalsy } from "~/utils/remix.server";
import { teamPage } from "~/utils/urls";
import * as TeamRepository from "../TeamRepository.server";
import { teamParamsSchema } from "../team-schemas.server";
import { isTeamManager } from "../team-utils";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const user = await requireUser(request);
	const { customUrl } = teamParamsSchema.parse(params);

	const team = notFoundIfFalsy(await TeamRepository.findByCustomUrl(customUrl));

	if (!isTeamManager({ team, user }) && !user.roles.includes("ADMIN")) {
		throw redirect(teamPage(customUrl));
	}

	return { team, css: team.css };
};
