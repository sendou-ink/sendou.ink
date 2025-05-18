import cachified from "@epic-web/cachified";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getUser } from "~/features/auth/core/user.server";
import * as QMatchRepository from "~/features/sendouq-match/QMatchRepository.server";
import { reportedWeaponsToArrayOfArrays } from "~/features/sendouq-match/core/reported-weapons.server";
import { reportedWeaponsByMatchId } from "~/features/sendouq-match/queries/reportedWeaponsByMatchId.server";
import { cache } from "~/utils/cache.server";
import { databaseTimestampToDate } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { qMatchPageParamsSchema } from "../q-match-schemas";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const user = await getUser(request);
	const matchId = parseParams({
		params,
		schema: qMatchPageParamsSchema,
	}).id;
	const match = notFoundIfFalsy(await QMatchRepository.findById(matchId));

	const [groupAlpha, groupBravo] = await Promise.all([
		QMatchRepository.findGroupById({
			groupId: match.alphaGroupId,
			loggedInUserId: user?.id,
		}),
		QMatchRepository.findGroupById({
			groupId: match.bravoGroupId,
			loggedInUserId: user?.id,
		}),
	]);
	invariant(groupAlpha, "Group alpha not found");
	invariant(groupBravo, "Group bravo not found");

	const isTeamAlphaMember = groupAlpha.members.some((m) => m.id === user?.id);
	const isTeamBravoMember = groupBravo.members.some((m) => m.id === user?.id);
	const isMatchInsider =
		isTeamAlphaMember || isTeamBravoMember || user?.roles.includes("STAFF");
	const matchHappenedInTheLastMonth =
		databaseTimestampToDate(match.createdAt).getTime() >
		Date.now() - 30 * 24 * 3600 * 1000;

	const censoredGroupAlpha = {
		...groupAlpha,
		chatCode: undefined,
		members: groupAlpha.members.map((m) => ({
			...m,
			friendCode:
				isMatchInsider && matchHappenedInTheLastMonth
					? m.friendCode
					: undefined,
		})),
	};
	const censoredGroupBravo = {
		...groupBravo,
		chatCode: undefined,
		members: groupBravo.members.map((m) => ({
			...m,
			friendCode:
				isMatchInsider && matchHappenedInTheLastMonth
					? m.friendCode
					: undefined,
		})),
	};
	const censoredMatch = { ...match, chatCode: undefined };

	const groupChatCode = () => {
		if (isTeamAlphaMember) return groupAlpha.chatCode;
		if (isTeamBravoMember) return groupBravo.chatCode;

		return null;
	};

	const rawReportedWeapons = match.reportedAt
		? reportedWeaponsByMatchId(matchId)
		: null;

	const banScreen = !match.isLocked
		? await cachified({
				key: `matches-screen-ban-${match.id}`,
				cache,
				async getFreshValue() {
					const noScreenSettings =
						await QMatchRepository.groupMembersNoScreenSettings([
							groupAlpha,
							groupBravo,
						]);

					return noScreenSettings.some((user) => user.noScreen);
				},
			})
		: null;

	return {
		match: censoredMatch,
		matchChatCode: isMatchInsider ? match.chatCode : null,
		canPostChatMessages: isTeamAlphaMember || isTeamBravoMember,
		groupChatCode: groupChatCode(),
		groupAlpha: censoredGroupAlpha,
		groupBravo: censoredGroupBravo,
		banScreen,
		groupMemberOf: isTeamAlphaMember
			? ("ALPHA" as const)
			: isTeamBravoMember
				? ("BRAVO" as const)
				: null,
		reportedWeapons: match.reportedAt
			? reportedWeaponsToArrayOfArrays({
					groupAlpha,
					groupBravo,
					mapList: match.mapList,
					reportedWeapons: rawReportedWeapons,
				})
			: null,
		rawReportedWeapons,
	};
};
