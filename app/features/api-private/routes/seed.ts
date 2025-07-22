import type { ActionFunction } from "@remix-run/node";
import { z } from "zod/v4";
import { seed } from "~/db/seed";
import { SEED_VARIATIONS } from "~/features/api-private/constants";
import { parseRequestPayload } from "~/utils/remix.server";

const seedSchema = z.object({
	variation: z.enum(SEED_VARIATIONS).nullish(),
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
