import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { sql } from "~/db/sql";
import type { ReportedWeapon } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import type { ChatMessage } from "~/features/chat/chat-types";
import * as Seasons from "~/features/mmr/core/Seasons";
import { refreshUserSkills } from "~/features/mmr/tiered.server";
import { SendouQ } from "~/features/sendouq/core/SendouQ.server";
import * as PrivateUserNoteRepository from "~/features/sendouq/PrivateUserNoteRepository.server";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
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
import { compareMatchToReportedScores } from "../core/match.server";
import { mergeReportedWeapons } from "../core/reported-weapons.server";
import { calculateMatchSkills } from "../core/skills.server";
import {
	summarizeMaps,
	summarizePlayerResults,
} from "../core/summarizer.server";
import { matchSchema, qMatchPageParamsSchema } from "../q-match-schemas";
import { winnersArrayToWinner } from "../q-match-utils";
import { addDummySkill } from "../queries/addDummySkill.server";
import { addMapResults } from "../queries/addMapResults.server";
import { addPlayerResults } from "../queries/addPlayerResults.server";
import { addReportedWeapons } from "../queries/addReportedWeapons.server";
import { addSkills } from "../queries/addSkills.server";
import { deleteReporterWeaponsByMatchId } from "../queries/deleteReportedWeaponsByMatchId.server";
import { findMatchById } from "../queries/findMatchById.server";
import { reportedWeaponsByMatchId } from "../queries/reportedWeaponsByMatchId.server";
import { reportScore } from "../queries/reportScore.server";
import { setGroupAsInactive } from "../queries/setGroupAsInactive.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const matchId = parseParams({
		params,
		schema: qMatchPageParamsSchema,
	}).id;
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: matchSchema,
	});

	switch (data._action) {
		case "REPORT_SCORE": {
			const reportWeapons = () => {
				const oldReportedWeapons = reportedWeaponsByMatchId(matchId) ?? [];

				const mergedWeapons = mergeReportedWeapons({
					oldWeapons: oldReportedWeapons,
					newWeapons: data.weapons as (ReportedWeapon & {
						mapIndex: number;
						groupMatchMapId: number;
					})[],
					newReportedMapsCount: data.winners.length,
				});

				sql.transaction(() => {
					deleteReporterWeaponsByMatchId(matchId);
					addReportedWeapons(mergedWeapons);
				})();
			};

			const unmappedMatch = notFoundIfFalsy(
				await SQMatchRepository.findById(matchId),
			);
			const match = SendouQ.mapMatch(unmappedMatch, user);
			if (match.isLocked) {
				reportWeapons();
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

			const groupMemberOfId = members.find((m) => m.id === user.id)?.groupId;
			invariant(
				groupMemberOfId || data.adminReport,
				"User is not a member of any group",
			);

			const winner = winnersArrayToWinner(data.winners);
			const winnerGroupId =
				winner === "ALPHA" ? match.groupAlpha.id : match.groupBravo.id;
			const loserGroupId =
				winner === "ALPHA" ? match.groupBravo.id : match.groupAlpha.id;

			// when admin reports match gets locked right away
			const compared = data.adminReport
				? "SAME"
				: compareMatchToReportedScores({
						match,
						winners: data.winners,
						newReporterGroupId: groupMemberOfId!,
						previousReporterGroupId: match.reportedByUserId
							? members.find((m) => m.id === match.reportedByUserId)!.groupId
							: undefined,
					});

			// same group reporting same score, probably by mistake
			if (compared === "DUPLICATE") {
				reportWeapons();
				return null;
			}

			const matchIsBeingCanceled = data.winners.length === 0;

			const { newSkills, differences } =
				compared === "SAME" && !matchIsBeingCanceled
					? calculateMatchSkills({
							groupMatchId: match.id,
							winner: (match.groupAlpha.id === winnerGroupId
								? match.groupAlpha
								: match.groupBravo
							).members.map((m) => m.id),
							loser: (match.groupAlpha.id === loserGroupId
								? match.groupAlpha
								: match.groupBravo
							).members.map((m) => m.id),
							winnerGroupId,
							loserGroupId,
						})
					: { newSkills: null, differences: null };

			const shouldLockMatchWithoutChangingRecords =
				compared === "SAME" && matchIsBeingCanceled;

			let clearCaches = false;
			sql.transaction(() => {
				if (
					compared === "FIX_PREVIOUS" ||
					compared === "FIRST_REPORT" ||
					data.adminReport
				) {
					reportScore({
						matchId,
						reportedByUserId: user.id,
						winners: data.winners,
					});
				}
				// own group gets set inactive
				if (groupMemberOfId) setGroupAsInactive(groupMemberOfId);
				// skills & map/player results only update after both teams have reported
				if (newSkills) {
					addMapResults(
						summarizeMaps({ match, members, winners: data.winners }),
					);
					addPlayerResults(
						summarizePlayerResults({ match, members, winners: data.winners }),
					);
					addSkills({
						skills: newSkills,
						differences,
						groupMatchId: match.id,
						oldMatchMemento: match.memento,
					});
					clearCaches = true;
				}
				if (shouldLockMatchWithoutChangingRecords) {
					addDummySkill(match.id);
					clearCaches = true;
				}
				// fix edge case where they 1) report score 2) report weapons 3) report score again, but with different amount of maps played
				if (compared === "FIX_PREVIOUS") {
					deleteReporterWeaponsByMatchId(matchId);
				}
				// admin reporting, just set both groups inactive
				if (data.adminReport) {
					setGroupAsInactive(match.groupAlpha.id);
					setGroupAsInactive(match.groupBravo.id);
				}
			})();

			if (clearCaches) {
				// this is kind of useless to do when admin reports since skills don't change
				// but it's not the most common case so it's ok
				try {
					refreshUserSkills(Seasons.currentOrPrevious()!.nth);
				} catch (error) {
					logger.warn("Error refreshing user skills", error);
				}

				refreshStreamsCache();
			}

			if (compared === "DIFFERENT") {
				return {
					error: matchIsBeingCanceled
						? ("cant-cancel" as const)
						: ("different" as const),
				};
			}

			// in a different transaction but it's okay
			reportWeapons();

			if (match.chatCode) {
				const type = (): NonNullable<ChatMessage["type"]> => {
					if (compared === "SAME") {
						return matchIsBeingCanceled
							? "CANCEL_CONFIRMED"
							: "SCORE_CONFIRMED";
					}

					return matchIsBeingCanceled ? "CANCEL_REPORTED" : "SCORE_REPORTED";
				};

				ChatSystemMessage.send({
					room: match.chatCode,
					type: type(),
					context: {
						name: user.username,
					},
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

			throw redirect(SENDOUQ_PREPARING_PAGE);
		}
		case "REPORT_WEAPONS": {
			const match = notFoundIfFalsy(findMatchById(matchId));
			errorToastIfFalsy(match.reportedAt, "Match has not been reported yet");

			const oldReportedWeapons = reportedWeaponsByMatchId(matchId) ?? [];

			const mergedWeapons = mergeReportedWeapons({
				oldWeapons: oldReportedWeapons,
				newWeapons: data.weapons as (ReportedWeapon & {
					mapIndex: number;
					groupMatchMapId: number;
				})[],
			});

			sql.transaction(() => {
				deleteReporterWeaponsByMatchId(matchId);
				addReportedWeapons(mergedWeapons);
			})();

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
