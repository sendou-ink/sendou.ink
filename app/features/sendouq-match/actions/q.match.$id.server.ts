import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import type { ReportedWeapon } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import type { ChatMessage } from "~/features/chat/chat-types";
import * as Seasons from "~/features/mmr/core/Seasons";
import { refreshUserSkills } from "~/features/mmr/tiered.server";
import {
	refreshSendouQInstance,
	SendouQ,
} from "~/features/sendouq/core/SendouQ.server";
import * as PrivateUserNoteRepository from "~/features/sendouq/PrivateUserNoteRepository.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import { refreshStreamsCache } from "~/features/sendouq-streams/core/streams.server";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import {
	errorToastIfFalsy,
	notFoundIfFalsy,
	parseParams,
	parseRequestPayload,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { SENDOUQ_PREPARING_PAGE, sendouQMatchPage } from "~/utils/urls";
import { mergeReportedWeapons } from "../core/reported-weapons.server";
import { matchSchema, qMatchPageParamsSchema } from "../q-match-schemas";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const matchId = parseParams({
		params,
		schema: qMatchPageParamsSchema,
	}).id;
	const user = requireUser();
	const data = await parseRequestPayload({
		request,
		schema: matchSchema,
	});

	switch (data._action) {
		case "REPORT_SCORE": {
			const unmappedMatch = notFoundIfFalsy(
				await SQMatchRepository.findById(matchId),
			);
			const match = SendouQ.mapMatch(unmappedMatch, user);

			if (match.isLocked) {
				const oldReportedWeapons =
					(await ReportedWeaponRepository.findByMatchId(matchId)) ?? [];
				const mergedWeapons = mergeReportedWeapons({
					oldWeapons: oldReportedWeapons,
					newWeapons: data.weapons as (ReportedWeapon & {
						mapIndex: number;
						groupMatchMapId: number;
					})[],
					newReportedMapsCount: data.winners.length,
				});
				await ReportedWeaponRepository.replaceByMatchId(matchId, mergedWeapons);
				return null;
			}

			errorToastIfFalsy(
				!data.adminReport || user.roles.includes("STAFF"),
				"Only mods can report scores as admin",
			);

			const members = [
				...match.groupAlpha.members.map((m) => ({
					...m,
					groupId: match.groupAlpha.id,
				})),
				...match.groupBravo.members.map((m) => ({
					...m,
					groupId: match.groupBravo.id,
				})),
			];
			invariant(
				members.some((m) => m.id === user.id) || data.adminReport,
				"User is not a member of any group",
			);

			if (data.adminReport) {
				await SQMatchRepository.adminReport({
					matchId,
					reportedByUserId: user.id,
					winners: data.winners,
				});

				await refreshSendouQInstance();

				if (match.chatCode) {
					ChatSystemMessage.send({
						room: match.chatCode,
						type: "SCORE_CONFIRMED",
						context: { name: user.username },
					});
				}

				break;
			}

			const matchIsBeingCanceled = data.winners.length === 0;

			if (matchIsBeingCanceled) {
				const result = await SQMatchRepository.cancelMatch({
					matchId,
					reportedByUserId: user.id,
				});

				if (result.shouldRefreshCaches) {
					try {
						refreshUserSkills(Seasons.currentOrPrevious()!.nth);
					} catch (error) {
						logger.warn("Error refreshing user skills", error);
					}
					refreshStreamsCache();
				}

				if (result.status === "CANT_CANCEL") {
					return { error: "cant-cancel" as const };
				}

				await refreshSendouQInstance();

				if (match.chatCode) {
					const type: NonNullable<ChatMessage["type"]> =
						result.status === "CANCEL_CONFIRMED"
							? "CANCEL_CONFIRMED"
							: "CANCEL_REPORTED";

					ChatSystemMessage.send({
						room: match.chatCode,
						type,
						context: { name: user.username },
					});
				}

				break;
			}

			const result = await SQMatchRepository.reportScore({
				matchId,
				reportedByUserId: user.id,
				winners: data.winners,
				weapons: data.weapons as (ReportedWeapon & {
					mapIndex: number;
					groupMatchMapId: number;
				})[],
			});

			if (result.shouldRefreshCaches) {
				try {
					refreshUserSkills(Seasons.currentOrPrevious()!.nth);
				} catch (error) {
					logger.warn("Error refreshing user skills", error);
				}
				refreshStreamsCache();
			}

			if (result.status === "DIFFERENT") {
				return { error: "different" as const };
			}

			if (result.status !== "DUPLICATE") {
				await refreshSendouQInstance();
			}

			if (match.chatCode && result.status !== "DUPLICATE") {
				const type: NonNullable<ChatMessage["type"]> =
					result.status === "CONFIRMED" ? "SCORE_CONFIRMED" : "SCORE_REPORTED";

				ChatSystemMessage.send({
					room: match.chatCode,
					type,
					context: { name: user.username },
				});
			}

			break;
		}
		case "LOOK_AGAIN": {
			const season = Seasons.current();
			errorToastIfFalsy(season, "Season is not active");

			const match = notFoundIfFalsy(await SQMatchRepository.findById(matchId));
			const previousGroup =
				match.groupAlpha.id === data.previousGroupId
					? match.groupAlpha
					: match.groupBravo.id === data.previousGroupId
						? match.groupBravo
						: null;
			errorToastIfFalsy(
				previousGroup,
				"Previous group not found in this match",
			);

			for (const member of previousGroup.members) {
				const currentGroup = SendouQ.findOwnGroup(member.id);
				errorToastIfFalsy(!currentGroup, "Member is already in a group");
				if (member.id === user.id) {
					errorToastIfFalsy(
						member.role === "OWNER",
						"You are not the owner of the group",
					);
				}
			}

			await SQGroupRepository.createGroupFromPrevious({
				previousGroupId: data.previousGroupId,
				members: previousGroup.members.map((m) => ({ id: m.id, role: m.role })),
			});

			await refreshSendouQInstance();

			throw redirect(SENDOUQ_PREPARING_PAGE);
		}
		case "REPORT_WEAPONS": {
			const match = notFoundIfFalsy(await SQMatchRepository.findById(matchId));
			errorToastIfFalsy(match.reportedAt, "Match has not been reported yet");

			const oldReportedWeapons =
				(await ReportedWeaponRepository.findByMatchId(matchId)) ?? [];

			const mergedWeapons = mergeReportedWeapons({
				oldWeapons: oldReportedWeapons,
				newWeapons: data.weapons as (ReportedWeapon & {
					mapIndex: number;
					groupMatchMapId: number;
				})[],
			});

			await ReportedWeaponRepository.replaceByMatchId(matchId, mergedWeapons);

			break;
		}
		case "ADD_PRIVATE_USER_NOTE": {
			await PrivateUserNoteRepository.upsert({
				authorId: user.id,
				sentiment: data.sentiment,
				targetId: data.targetId,
				text: data.comment,
			});

			throw redirect(sendouQMatchPage(matchId));
		}
		default: {
			assertUnreachable(data);
		}
	}

	return null;
};
