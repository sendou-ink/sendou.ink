import type { LoaderFunctionArgs } from "@remix-run/node";
import { z } from "zod";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import * as TournamentOrganizationRepository from "./TournamentOrganizationRepository.server";

const organizationParamsSchema = z.object({
	slug: z.string(),
});

export async function organizationFromParams(
	params: LoaderFunctionArgs["params"],
) {
	const { slug } = parseParams({ params, schema: organizationParamsSchema });
	return notFoundIfFalsy(
		await TournamentOrganizationRepository.findBySlug(slug),
	);
}
