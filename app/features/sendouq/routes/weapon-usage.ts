import type { LoaderFunctionArgs } from "react-router";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import { parseSearchParams } from "~/utils/remix.server";
import { weaponUsageSearchParamsSchema } from "../q-schemas.server";

export type WeaponUsageLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const data = parseSearchParams({
		request,
		schema: weaponUsageSearchParamsSchema,
	});

	return {
		usage: await ReportedWeaponRepository.weaponUsageStats({
			mode: data.modeShort,
			season: data.season,
			stageId: data.stageId,
			userId: data.userId,
		}),
	};
};
