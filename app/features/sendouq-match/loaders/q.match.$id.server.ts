import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { SendouQ } from "~/features/sendouq/core/SendouQ.server";
import * as PrivateUserNoteRepository from "~/features/sendouq/PrivateUserNoteRepository.server";
import { reportedWeaponsToArrayOfArrays } from "~/features/sendouq-match/core/reported-weapons.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { sendouQMatchPage } from "~/utils/urls";
import { qMatchPageParamsSchema } from "../q-match-schemas";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = getUser();
	const matchId = parseParams({
		params,
		schema: qMatchPageParamsSchema,
	}).id;
	const matchUnmapped = notFoundIfFalsy(
		await SQMatchRepository.findById(matchId),
	);

	const matchUsers = [
		...matchUnmapped.groupAlpha.members,
		...matchUnmapped.groupBravo.members,
	].map((m) => m.id);
	const privateNotes = user
		? await PrivateUserNoteRepository.byAuthorUserId(user.id, matchUsers)
		: undefined;

	const match = SendouQ.mapMatch(matchUnmapped, user, privateNotes);

	const rawReportedWeapons = match.reportedAt
		? await ReportedWeaponRepository.findByMatchId(matchId)
		: null;

	const participantIds = [
		...matchUnmapped.groupAlpha.members,
		...matchUnmapped.groupBravo.members,
	].map((m) => m.id);
	if (match.chatCode && !match.isLocked) {
		ChatSystemMessage.setMetadata({
			chatCode: match.chatCode,
			header: `Match #${matchId}`,
			subtitle: "SendouQ",
			url: sendouQMatchPage(matchId),
			participantUserIds: participantIds,
			expiresAfter: { hours: 2 },
		});
	}

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
		chatCode:
			user?.roles.includes("STAFF") && !participantIds.includes(user.id)
				? match.chatCode
				: null,
	};
};
