import type { LoaderFunctionArgs, SerializeFrom } from "@remix-run/node";
import { parseSearchParams } from "~/utils/remix.server";
import { weaponUsageSearchParamsSchema } from "../q-schemas.server";
import { weaponUsageStats } from "../queries/weaponUsageStats.server";

export type WeaponUsageLoaderData = SerializeFrom<typeof loader>;

export const loader = ({ request }: LoaderFunctionArgs) => {
	const data = parseSearchParams({
		request,
		schema: weaponUsageSearchParamsSchema,
	});

	return {
		usage: weaponUsageStats({
			mode: data.modeShort,
			season: data.season,
			stageId: data.stageId,
			userId: data.userId,
		}),
	};
};
