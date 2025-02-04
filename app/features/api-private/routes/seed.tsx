import type { ActionFunction } from "@remix-run/node";
import { z } from "zod";
import { seed } from "~/db/seed";
import { parseRequestPayload } from "~/utils/remix.server";

const seedSchema = z.object({
	variation: z
		.enum([
			"NO_TOURNAMENT_TEAMS",
			"DEFAULT",
			"REG_OPEN",
			"SMALL_SOS",
			"NZAP_IN_TEAM",
		])
		.nullish(),
});

export type SeedVariation = NonNullable<
	z.infer<typeof seedSchema>["variation"]
>;

export const action: ActionFunction = async ({ request }) => {
	if (process.env.NODE_ENV === "production") {
		throw new Response(null, { status: 400 });
	}

	const { variation } = await parseRequestPayload({
		request,
		schema: seedSchema,
	});

	await seed(variation);

	return null;
};
