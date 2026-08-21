import type { LoaderFunctionArgs } from "react-router";
import * as v from "valibot";
import { requirePermission } from "~/modules/permissions/guards.server";
import { notFoundIfNullish } from "~/utils/remix.server";
import * as TeamRepository from "../TeamRepository.server";
import { teamParamsSchema } from "../team-schemas.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { customUrl } = v.parse(teamParamsSchema, params);

	const team = notFoundIfNullish(
		await TeamRepository.findByCustomUrl(customUrl, {
			includeInviteCode: true,
		}),
	);

	requirePermission(team, "MANAGE_ROSTER");

	return {
		team,
	};
};
