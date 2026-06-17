import { z } from "zod";
import { userIsBanned } from "~/features/ban/core/banned.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import { tournamentTeamNameTaken } from "~/features/tournament/tournament-utils.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { inGameNameIsValid } from "~/features/user-page/in-game-name";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import {
	ADMIN_REGISTRATION_MAX_MEMBERS,
	adminRegistrationFormSchema,
} from "./tournament-admin-registration-schemas";

/**
 * Extends the client {@link adminRegistrationFormSchema} with server-only,
 * context-dependent validations that surface as field errors (rather than toasts):
 * unique team name, roster size limit, and per-member friend code / in-game name /
 * ban / already-on-another-team checks.
 */
export function adminRegistrationFormSchemaServer({
	tournament,
}: {
	tournament: Tournament;
}) {
	return adminRegistrationFormSchema.superRefine(async (data, ctx) => {
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
				code: z.ZodIssueCode.custom,
				message: "forms:errors.regTeamNameTaken",
				path: [data.linkedTeam ? "teamId" : "pickUpName"],
			});
		}

		if (data.members.length > ADMIN_REGISTRATION_MAX_MEMBERS) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "forms:errors.regTooManyMembers",
				path: ["members"],
			});
		}

		const team =
			typeof data.tournamentTeamId === "number"
				? tournament.teamById(data.tournamentTeamId)
				: undefined;
		const currentMemberIds = team?.members.map((member) => member.userId) ?? [];

		if (team) {
			const submittedMemberIds = data.members.map((member) => member.userId);
			const membersToRemove = currentMemberIds.filter(
				(memberId) => !submittedMemberIds.includes(memberId),
			);

			if (tournament.hasStarted) {
				const participatedPlayerIds = tournament
					.participatedPlayersByTeamId(team.id)
					.map((player) => player.userId);
				const removingParticipatedPlayer = membersToRemove.some((memberId) =>
					participatedPlayerIds.includes(memberId),
				);
				if (removingParticipatedPlayer) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
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
					code: z.ZodIssueCode.custom,
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
					code: z.ZodIssueCode.custom,
					message: "forms:errors.regMemberInvalid",
					path,
				});
				continue;
			}

			if (!memberUser.friendCode) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "forms:errors.regMemberNoFriendCode",
					path,
				});
			}

			if (
				tournament.ctx.settings.requireInGameNames &&
				!memberUser.inGameName
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "forms:errors.regMemberNoInGameName",
					path,
				});
			}

			// only members not already on the team are subject to ban / other-team checks
			if (currentMemberIds.includes(member.userId)) continue;

			if (userIsBanned(member.userId)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "forms:errors.regMemberBanned",
					path,
				});
			}

			const previousTeam = tournament.teamMemberOfByUser({ id: member.userId });
			if (
				previousTeam &&
				previousTeam.id !== team?.id &&
				!tournament.hasStarted
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "forms:errors.regMemberOnAnotherTeam",
					path,
				});
			}
		}
	});
}
