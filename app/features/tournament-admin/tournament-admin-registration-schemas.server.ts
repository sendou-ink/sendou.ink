import * as v from "valibot";
import { userIsBanned } from "~/features/ban/core/banned.server";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import {
	isOneModeTournamentOf,
	validateCounterPickMapPool,
} from "~/features/tournament/tournament-utils";
import { tournamentTeamNameTaken } from "~/features/tournament/tournament-utils.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { superRefineAsync } from "~/utils/schema";
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
			if (tournament.teamsPrePickMaps && !tournament.hasStarted) {
				const currentMapPool =
					typeof data.tournamentTeamId === "number"
						? ((
								await TournamentTeamRepository.findMapPoolsByTeamIds([
									data.tournamentTeamId,
								])
							).get(data.tournamentTeamId) ?? [])
						: [];
				// a pool can stop being valid after picking (map banned, tie-breaker pool changed), so only
				// a changed pool is validated and an untouched one can't block unrelated edits
				const mapPoolChanged =
					MapPool.serialize(data.mapPool) !== MapPool.serialize(currentMapPool);

				if (mapPoolChanged) {
					const invalidMode = data.mapPool.some(
						(map) => !tournament.modesIncluded.includes(map.mode),
					);
					const status = validateCounterPickMapPool(
						new MapPool(data.mapPool),
						isOneModeTournamentOf(
							tournament.ctx.mapPickingStyle,
							tournament.ctx.toSetMapPool,
						),
						tournament.ctx.tieBreakerMapPool,
					);

					if (invalidMode || status !== "VALID") {
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

				const memberUser = await UserRepository.findLeanById(member.userId);
				if (!memberUser) {
					ctx.addIssue({
						message: "forms:errors.regMemberInvalid",
						path,
					});
					continue;
				}

				if (!memberUser.friendCode) {
					ctx.addIssue({
						message: "forms:errors.regMemberNoFriendCode",
						path,
					});
				}

				if (
					tournament.ctx.settings.requireInGameNames &&
					!member.inGameName &&
					!memberUser.inGameName
				) {
					ctx.addIssue({
						message: "forms:errors.regMemberNoInGameName",
						path,
					});
				}

				// only members not already on the team are subject to ban / other-team checks
				if (currentMemberIds.includes(member.userId)) continue;

				if (userIsBanned(member.userId)) {
					ctx.addIssue({
						message: "forms:errors.regMemberBanned",
						path,
					});
				}

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
