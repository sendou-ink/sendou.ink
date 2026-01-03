import type { ActionFunction } from "react-router";
import { z } from "zod";
import { seed } from "~/db/seed";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "~/features/admin/core/dev-controls";
import { SEED_VARIATIONS } from "~/features/api-private/constants";
import { refreshBannedCache } from "~/features/ban/core/banned.server";
import { refreshSendouQInstance } from "~/features/sendouq/core/SendouQ.server";
import { parseRequestPayload } from "~/utils/remix.server";

const seedSchema = z.object({
	variation: z.enum(SEED_VARIATIONS).nullish(),
});

export type SeedVariation = NonNullable<
	z.infer<typeof seedSchema>["variation"]
>;

export const action: ActionFunction = async ({ request }) => {
	if (!DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
		throw new Response(null, { status: 400 });
	}

	const { variation } = await parseRequestPayload({
		request,
		schema: seedSchema,
	});

	await seed(variation);

	await refreshBannedCache();
	await refreshSendouQInstance();

	return Response.json(null);
};
