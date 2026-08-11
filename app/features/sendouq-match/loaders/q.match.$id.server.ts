import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import { chatAccessible } from "~/features/chat/chat-utils";
import * as Seasons from "~/features/mmr/core/Seasons";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import * as ScannerIngestRepository from "~/features/scanner-ingest/ScannerIngestRepository.server";
import { SendouQ } from "~/features/sendouq/core/SendouQ.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import { databaseTimestampToDate } from "~/utils/dates";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { qMatchPageParamsSchema } from "../q-match-schemas";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = getUser();
	const matchId = parseParams({
		params,
		schema: qMatchPageParamsSchema,
	}).id;

	const matchUnmapped = notFoundIfNullish(
		await SQMatchRepository.findById(matchId),
	);

	const matchUsers = [
		...matchUnmapped.groupAlpha.members,
		...matchUnmapped.groupBravo.members,
	].map((m) => m.id);

	const isStaff = user?.roles.includes("STAFF") ?? false;
	const isParticipant = Boolean(user && matchUsers.includes(user.id));

	if (user && isParticipant) {
		await resolveNotifications({
			userIds: [user.id],
			type: "SQ_NEW_MATCH",
			meta: { matchId },
		});
	}

	const reportedWeapons = await ReportedWeaponRepository.findByMatchId(matchId);
	const ingestedScoreboards =
		await ScannerIngestRepository.findScoreboardsByGroupMatchId(matchId);

	const match = SendouQ.mapMatch(matchUnmapped, user);

	return {
		...(await UserCardRepository.findAllByUserIds({
			userIds: matchUsers,
			include: { friendCode: isStaff || isParticipant },
		})),
		match,
		reportedWeapons,
		ingestedScoreboards,
		isOffSeason: Seasons.current() === null,
		chatCode: (() => {
			if (!(isStaff || isParticipant)) return null;

			const accessible = chatAccessible({
				isStaff,
				expiresAfterDays: 1,
				comparedTo: databaseTimestampToDate(matchUnmapped.createdAt),
			});
			if (!accessible) return null;

			if (!isParticipant) return match.chatCode ?? null;

			const codes = [
				match.chatCode,
				match.groupAlpha.chatCode,
				match.groupBravo.chatCode,
			].filter((c): c is string => Boolean(c));

			if (codes.length === 0) return null;
			if (codes.length === 1) return codes[0];
			return codes;
		})(),
	};
};

export type SendouQMatchLoaderData = SerializeFrom<typeof loader>;
