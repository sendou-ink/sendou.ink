import { z } from "zod";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import {
	array,
	fieldset,
	idConstantOptional,
	image,
	selectDynamic,
	stringConstant,
	teamSearchOptional,
	textFieldOptional,
	toggle,
	userSearch,
} from "~/form/fields";
import { TEAM } from "../team/team-constants";
import { IN_GAME_NAME_REGEXP } from "../user-page/user-page-constants";

/** Combined in-game name e.g. `Sendou#1234` is at most 10 + `#` + 5 characters. */
const IN_GAME_NAME_MAX_LENGTH = 16;

const memberFieldset = fieldset({
	fields: z.object({
		userId: userSearch({ label: "labels.player" }),
		inGameName: textFieldOptional({
			label: "labels.inGameName",
			maxLength: IN_GAME_NAME_MAX_LENGTH,
			regExp: {
				pattern: IN_GAME_NAME_REGEXP,
				message: "forms:errors.profileInGameName",
			},
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
