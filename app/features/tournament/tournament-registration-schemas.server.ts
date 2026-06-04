import { z } from "zod";
import { userIsBanned } from "~/features/ban/core/banned.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { adminRegistrationFormSchema } from "./tournament-registration-schemas";

/**
 * Extends the client {@link adminRegistrationFormSchema} with server-only,
 * context-dependent validations that surface as field errors (rather than toasts):
 * unique team name, roster size limit, and per-member friend code / in-game name /
 * ban / already-on-another-team checks.
 */
export function adminRegistrationFormSchemaServer({
	tournament,
	name,
}: {
	tournament: Tournament;
	/** Resolved team name (typed pickup name, or the linked team's name). */
	name: string;
}) {
	return adminRegistrationFormSchema.superRefine(async (data, ctx) => {
		const nameTaken = !tournament.ctx.teams.every(
			(team) => team.id === data.tournamentTeamId || team.name !== name,
		);
		if (nameTaken) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "forms:errors.regTeamNameTaken",
				path: [data.linkedTeam ? "teamId" : "pickUpName"],
			});
		}

		if (data.members.length > tournament.maxMembersPerTeam) {
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

			// xxx: check how adding member to another team logic used to work
			const previousTeam = tournament.teamMemberOfByUser({ id: member.userId });
			if (previousTeam && previousTeam.id !== team?.id) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "forms:errors.regMemberOnAnotherTeam",
					path,
				});
			}
		}
	});
}
