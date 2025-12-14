import type { LoaderFunctionArgs } from "@remix-run/node";
import { getUser } from "~/features/auth/core/user.server";
import { SQManager } from "~/features/sendouq/core/SQManager.server";
import { reportedWeaponsToArrayOfArrays } from "~/features/sendouq-match/core/reported-weapons.server";
import * as QMatchRepository from "~/features/sendouq-match/QMatchRepository.server";
import { reportedWeaponsByMatchId } from "~/features/sendouq-match/queries/reportedWeaponsByMatchId.server";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { qMatchPageParamsSchema } from "../q-match-schemas";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const user = await getUser(request);
	const matchId = parseParams({
		params,
		schema: qMatchPageParamsSchema,
	}).id;
	const matchUnmapped = notFoundIfFalsy(
		await QMatchRepository.findById(matchId),
	);
	const match = SQManager.mapMatch(matchUnmapped, user);

	const rawReportedWeapons = match.reportedAt
		? reportedWeaponsByMatchId(matchId)
		: null;

	return {
		match,
		reportedWeapons: match.reportedAt
			? reportedWeaponsToArrayOfArrays({
					groupAlpha: match.groupAlpha,
					groupBravo: match.groupBravo,
					mapList: match.mapList,
					reportedWeapons: rawReportedWeapons,
				})
			: null,
		rawReportedWeapons,
	};
};
