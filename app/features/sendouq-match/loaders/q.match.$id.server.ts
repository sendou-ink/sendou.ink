import type { LoaderFunctionArgs } from "@remix-run/node";
import { getUser } from "~/features/auth/core/user.server";
import { SQManager } from "~/features/sendouq/core/SQManager.server";
import * as PrivateUserNoteRepository from "~/features/sendouq/PrivateUserNoteRepository.server";
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

	const matchUsers = [
		...matchUnmapped.groupAlpha.members,
		...matchUnmapped.groupBravo.members,
	].map((m) => m.id);
	const privateNotes = user
		? await PrivateUserNoteRepository.byAuthorUserId(user.id, matchUsers)
		: undefined;

	const match = SQManager.mapMatch(matchUnmapped, user, privateNotes);

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
