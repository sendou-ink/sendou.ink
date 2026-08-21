import type { LoaderFunctionArgs } from "react-router";
import * as v from "valibot";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import * as TournamentOrganizationRepository from "./TournamentOrganizationRepository.server";

const organizationParamsSchema = v.object({
	slug: v.string(),
});

export async function organizationFromParams(
	params: LoaderFunctionArgs["params"],
) {
	const { slug } = parseParams({ params, schema: organizationParamsSchema });
	return notFoundIfNullish(
		await TournamentOrganizationRepository.findBySlug(slug),
	);
}
