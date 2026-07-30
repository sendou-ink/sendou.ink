import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import * as TournamentOrganizationRepository from "./TournamentOrganizationRepository.server";

const organizationParamsSchema = z.object({
	slug: z.string(),
});

export async function organizationFromParams(
	params: LoaderFunctionArgs["params"],
) {
	const { slug } = parseParams({ params, schema: organizationParamsSchema });
	return notFoundIfNullish(
		await TournamentOrganizationRepository.findBySlug(slug),
	);
}
