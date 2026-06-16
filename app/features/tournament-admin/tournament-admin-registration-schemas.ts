import { z } from "zod";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import {
	array,
	fieldset,
	idConstantOptional,
	image,
	inGameName,
	selectDynamic,
	stringConstant,
	teamSearchOptional,
	textFieldOptional,
	toggle,
	tournamentSearchOptional,
	userSearch,
} from "~/form/fields";
import { TEAM } from "../team/team-constants";

const memberFieldset = fieldset({
	fields: z.object({
		userId: userSearch({ label: "labels.player" }),
		inGameName: inGameName({
			label: "labels.inGameName",
		}),
	}),
});

export const adminRegistrationFormSchema = z
	.object({
		_action: stringConstant("UPSERT_REGISTRATION"),
		/** Present when editing an existing registration, absent when adding a new team. */
		tournamentTeamId: idConstantOptional(),
		/** false = pickup team (typed name), true = linked sendou.ink team. */
		linkedTeam: toggle({ label: "labels.regLinkedTeam" }),
		pickUpName: textFieldOptional({
			label: "labels.regTeamName",
			maxLength: TOURNAMENT.TEAM_NAME_MAX_LENGTH,
		}),
		/** Pickup team logo. Linked teams source their logo from the sendou.ink team instead. */
		logo: image({ label: "labels.logo" }),
		teamId: teamSearchOptional({ label: "labels.regTeam" }),
		/** `String(userId)` of the roster member that is the team owner/captain. */
		ownerId: selectDynamic({ label: "labels.regCaptain" }),
		members: array({
			label: "labels.members",
			min: 1,
			max: TEAM.MAX_MEMBER_COUNT,
			field: memberFieldset,
		}),
	})
	.superRefine((data, ctx) => {
		if (data.linkedTeam) {
			if (typeof data.teamId !== "number") {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "forms:errors.regLinkedTeamRequired",
					path: ["teamId"],
				});
			}
		} else if (!data.pickUpName) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "forms:errors.regTeamNameRequired",
				path: ["pickUpName"],
			});
		}

		const memberIds = data.members.map((member) => member.userId);
		if (memberIds.length !== new Set(memberIds).size) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "forms:errors.usersMustBeUnique",
				path: ["members"],
			});
		}

		if (!memberIds.some((memberId) => String(memberId) === data.ownerId)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "forms:errors.regOwnerMustBeMember",
				path: ["ownerId"],
			});
		}
	});

export type AdminRegistrationFormValues = z.input<
	typeof adminRegistrationFormSchema
>;

/**
 * Modal form used to import an existing team's roster from another tournament
 * into the {@link adminRegistrationFormSchema} when adding a new team. Validated
 * client-side only — submitting prefills the registration form rather than
 * hitting the server.
 */
export const importTeamFormSchema = z
	.object({
		sourceTournamentId: tournamentSearchOptional({
			label: "labels.regImportSourceTournament",
		}),
		sourceTournamentTeamId: selectDynamic({
			label: "labels.regTeam",
		}),
	})
	.superRefine((data, ctx) => {
		if (typeof data.sourceTournamentId !== "number") {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "forms:errors.regImportTournamentRequired",
				path: ["sourceTournamentId"],
			});
		}
	});

export type ImportTeamFormValues = z.input<typeof importTeamFormSchema>;
