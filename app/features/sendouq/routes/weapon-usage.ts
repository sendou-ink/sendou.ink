import type { LoaderFunctionArgs } from "react-router";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import { badRequest, badRequestIfFalsy } from "~/utils/remix.server";
import { weaponUsageSearchParams } from "../q-search-params";

export type WeaponUsageLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const params = weaponUsageSearchParams.parse(request);

	const userId = badRequestIfFalsy(params.userId);
	const modeShort = badRequestIfFalsy(params.modeShort);
	// season 0 and stageId 0 are valid values that badRequestIfFalsy would reject
	if (typeof params.season !== "number" || typeof params.stageId !== "number") {
		badRequest();
	}

	return {
		usage: await ReportedWeaponRepository.findAllWeaponUsageStats({
			mode: modeShort,
			season: params.season,
			stageId: params.stageId,
			userId,
		}),
	};
};
