import * as v from "valibot";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import * as TeamEligibility from "~/features/tournament/core/TeamEligibility.server";
import * as TeamPick from "~/features/tournament/core/TeamPick";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { tournamentTeamNameTaken } from "~/features/tournament/tournament-utils.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { superRefineAsync } from "~/utils/schema";
import { assertUnreachable } from "~/utils/types";
import {
	ADMIN_REGISTRATION_MAX_MEMBERS,
	adminRegistrationFormSchema,
} from "./tournament-admin-registration-schemas";

/**
 * {@link adminRegistrationFormSchema} plus server-only validations surfacing as field errors:
 * unique name, roster size, per-member friend code / in-game name / ban / other-team checks.
 */
export function adminRegistrationFormSchemaServer({
	tournament,
}: {
	tournament: Tournament;
}) {
	return v.pipeAsync(
		adminRegistrationFormSchema,
		superRefineAsync(async (data, ctx) => {
			const name = data.linkedTeam
				? typeof data.teamId === "number"
					? (await TeamRepository.findById(data.teamId))?.name
					: undefined
				: data.pickUpName;
			if (
				name != null &&
				tournamentTeamNameTaken({
					tournament,
					name,
					exceptTournamentTeamId: data.tournamentTeamId ?? undefined,
				})
			) {
				ctx.addIssue({
					message: "forms:errors.regTeamNameTaken",
					path: [data.linkedTeam ? "teamId" : "pickUpName"],
				});
			}

			if (data.members.length > ADMIN_REGISTRATION_MAX_MEMBERS) {
				ctx.addIssue({
					message: "forms:errors.regTooManyMembers",
					path: ["members"],
				});
			}

			// the map pool is only written while it can still be changed, matching the field's visibility
			const teamPick = tournament.teamPickSettings;
			if (teamPick && !tournament.hasStarted) {
				const currentMapPool =
					typeof data.tournamentTeamId === "number"
						? ((
								await TournamentTeamRepository.findMapPoolsByTeamIds([
									data.tournamentTeamId,
								])
							).get(data.tournamentTeamId) ?? [])
						: [];
				// a pool can stop being valid after picking (map banned, pool changed), so only
				// a changed pool is validated and an untouched one can't block unrelated edits
				const mapPoolChanged =
					MapPool.serialize(data.mapPool) !== MapPool.serialize(currentMapPool);

				if (mapPoolChanged) {
					const status = TeamPick.validateTeamPool({
						mapPool: new MapPool(data.mapPool),
						teamPick,
						pool: tournament.mapPool,
					});

					if (status !== "VALID") {
						ctx.addIssue({
							message: "forms:errors.invalidMapPool",
							path: ["mapPool"],
						});
					}
				}
			}

			const team =
				typeof data.tournamentTeamId === "number"
					? tournament.teamById(data.tournamentTeamId)
					: undefined;
			const currentMemberIds = team?.memberUserIds ?? [];

			if (team) {
				const submittedMemberIds = data.members.map((member) => member.userId);
				const membersToRemove = currentMemberIds.filter(
					(memberId) => !submittedMemberIds.includes(memberId),
				);

				if (tournament.hasStarted) {
					const participatedPlayerIds =
						tournament.participatedPlayerUserIdsByTeamId(team.id);
					const removingParticipatedPlayer = membersToRemove.some((memberId) =>
						participatedPlayerIds.includes(memberId),
					);
					if (removingParticipatedPlayer) {
						ctx.addIssue({
							message: "forms:errors.regCannotRemoveParticipatedPlayer",
							path: ["members"],
						});
					}
				}

				if (
					team.checkIns.length > 0 &&
					data.members.length < tournament.minMembersPerTeam
				) {
					ctx.addIssue({
						message: "forms:errors.regCheckedInBelowMinRoster",
						path: ["members"],
					});
				}
			}

			for (const [index, member] of data.members.entries()) {
				const path = ["members", index, "userId"];

				const isCurrentMember = currentMemberIds.includes(member.userId);

				const reason = await TeamEligibility.ineligibleReason({
					tournament,
					userId: member.userId,
					skip: [
						"ORG_BANNED",
						// only members not already on the team are subject to the ban check
						...(isCurrentMember ? (["SITE_BANNED"] as const) : []),
						// the in-game name given in the form is registered instead of the profile's
						...(member.inGameName ? (["NO_IN_GAME_NAME"] as const) : []),
					],
				});
				if (reason) {
					ctx.addIssue({ message: reasonErrorKey(reason), path });
				}
				if (reason === "USER_NOT_FOUND" || isCurrentMember) continue;

				const previousTeam = tournament.teamMemberOfByUser({
					id: member.userId,
				});
				if (
					previousTeam &&
					previousTeam.id !== team?.id &&
					!tournament.hasStarted
				) {
					ctx.addIssue({
						message: "forms:errors.regMemberOnAnotherTeam",
						path,
					});
				}
			}
		}),
	);
}

function reasonErrorKey(reason: TeamEligibility.IneligibleReason) {
	switch (reason) {
		case "USER_NOT_FOUND":
			return "forms:errors.regMemberInvalid";
		case "SITE_BANNED":
		case "ORG_BANNED":
			return "forms:errors.regMemberBanned";
		case "NO_FRIEND_CODE":
			return "forms:errors.regMemberNoFriendCode";
		case "NO_IN_GAME_NAME":
			return "forms:errors.regMemberNoInGameName";
		default:
			assertUnreachable(reason);
	}
}
