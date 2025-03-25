import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { sql } from "~/db/sql";
import type { ReportedWeapon } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import type { ChatMessage } from "~/features/chat/chat-types";
import { currentOrPreviousSeason, currentSeason } from "~/features/mmr/season";
import { refreshUserSkills } from "~/features/mmr/tiered.server";
import * as QMatchRepository from "~/features/sendouq-match/QMatchRepository.server";
import { refreshStreamsCache } from "~/features/sendouq-streams/core/streams.server";
import * as QRepository from "~/features/sendouq/QRepository.server";
import { findCurrentGroupByUserId } from "~/features/sendouq/queries/findCurrentGroupByUserId.server";
import { isMod } from "~/permissions";
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
import { reportScore } from "../queries/reportScore.server";
import { reportedWeaponsByMatchId } from "../queries/reportedWeaponsByMatchId.server";
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

			const match = notFoundIfFalsy(findMatchById(matchId));
			if (match.isLocked) {
				reportWeapons();
				return null;
			}

			errorToastIfFalsy(
				!data.adminReport || isMod(user),
				"Only mods can report scores as admin",
			);
			const members = [
				...(await QMatchRepository.findGroupById({
					groupId: match.alphaGroupId,
				}))!.members.map((m) => ({
					...m,
					groupId: match.alphaGroupId,
				})),
				...(await QMatchRepository.findGroupById({
					groupId: match.bravoGroupId,
				}))!.members.map((m) => ({
					...m,
					groupId: match.bravoGroupId,
				})),
			];

			const groupMemberOfId = members.find((m) => m.id === user.id)?.groupId;
			invariant(
				groupMemberOfId || data.adminReport,
				"User is not a member of any group",
			);

			const winner = winnersArrayToWinner(data.winners);
			const winnerGroupId =
				winner === "ALPHA" ? match.alphaGroupId : match.bravoGroupId;
			const loserGroupId =
				winner === "ALPHA" ? match.bravoGroupId : match.alphaGroupId;

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
							winner: (await QMatchRepository.findGroupById({
								groupId: winnerGroupId,
							}))!.members.map((m) => m.id),
							loser: (await QMatchRepository.findGroupById({
								groupId: loserGroupId,
							}))!.members.map((m) => m.id),
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
					setGroupAsInactive(match.alphaGroupId);
					setGroupAsInactive(match.bravoGroupId);
				}
			})();

			if (clearCaches) {
				// this is kind of useless to do when admin reports since skills don't change
				// but it's not the most common case so it's ok
				try {
					refreshUserSkills(currentOrPreviousSeason(new Date())!.nth);
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
			const season = currentSeason(new Date());
			errorToastIfFalsy(season, "Season is not active");

			const previousGroup = await QMatchRepository.findGroupById({
				groupId: data.previousGroupId,
			});
			errorToastIfFalsy(previousGroup, "Previous group not found");

			for (const member of previousGroup.members) {
				const currentGroup = findCurrentGroupByUserId(member.id);
				errorToastIfFalsy(!currentGroup, "Member is already in a group");
				if (member.id === user.id) {
					errorToastIfFalsy(
						member.role === "OWNER",
						"You are not the owner of the group",
					);
				}
			}

			await QRepository.createGroupFromPrevious({
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
			await QRepository.upsertPrivateUserNote({
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
