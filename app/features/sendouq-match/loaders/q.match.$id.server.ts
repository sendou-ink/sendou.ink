import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import { chatAccessible } from "~/features/chat/chat-utils";
import * as RoomLinkRepository from "~/features/chat/RoomLinkRepository.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { SendouQ } from "~/features/sendouq/core/SendouQ.server";
import * as PrivateUserNoteRepository from "~/features/sendouq/PrivateUserNoteRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { databaseTimestampToDate } from "~/utils/dates";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
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

	const [privateNotes, roomLinks, anyUserPrefersNoSplatnet, reportedWeapons] =
		await Promise.all([
			user ? PrivateUserNoteRepository.ownNotes(matchUsers) : undefined,
			RoomLinkRepository.findByUserIds(matchUsers, 3),
			UserRepository.anyUserPrefersNoSplatnet(matchUsers),
			ReportedWeaponRepository.findByMatchId(matchId),
		]);

	const match = SendouQ.mapMatch(matchUnmapped, user, privateNotes);

	return {
		match,
		roomLinks,
		anyUserPrefersNoSplatnet,
		reportedWeapons,
		isOffSeason: Seasons.current() === null,
		chatCode: (() => {
			const isStaff = user?.roles.includes("STAFF") ?? false;
			const isParticipant = user && matchUsers.includes(user.id);

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
