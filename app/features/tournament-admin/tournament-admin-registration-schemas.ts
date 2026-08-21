import * as v from "valibot";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import {
	array,
	customField,
	fieldset,
	idConstantOptional,
	image,
	selectDynamic,
	stringConstant,
	teamSearchOptional,
	textFieldOptional,
	toggle,
	tournamentSearchOptional,
	userSearch,
} from "~/form/fields";
import { modeShort, stageId, superRefine } from "~/utils/schema";
import { IN_GAME_NAME_MAX_LENGTH } from "../user-page/in-game-name";
import { USER } from "../user-page/user-page-constants";
/**
 * Roster size cap for organizer-managed registrations. The per-tournament
 * `maxMembersPerTeam` limit intentionally doesn't apply to organizers, so this
 * is a safety ceiling rather than a competitive constraint.
 */
export const ADMIN_REGISTRATION_MAX_MEMBERS = 12;

const memberFieldset = fieldset({
	fields: v.object({
		userId: userSearch({ label: "labels.player" }),
		inGameName: textFieldOptional({
			label: "labels.inGameName",
			maxLength: IN_GAME_NAME_MAX_LENGTH,
		}),
		/**
		 * Only editable by members of an established organization
		 * (`Tournament.canEditTournamentNames`), whose submission is authoritative:
		 * `null` clears the name the player has. Ignored from everyone else.
		 */
		tournamentName: textFieldOptional({
			label: "labels.tournamentName",
			bottomText: "bottomTexts.tournamentName",
			maxLength: USER.CUSTOM_NAME_MAX_LENGTH,
		}),
	}),
});

export const adminRegistrationFormSchema = v.pipe(
	v.object({
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
			max: ADMIN_REGISTRATION_MAX_MEMBERS,
			field: memberFieldset,
		}),
		mapPool: customField(
			{ initialValue: [] },
			v.array(v.object({ mode: modeShort, stageId })),
		),
	}),
	superRefine((data, ctx) => {
		if (data.linkedTeam) {
			if (typeof data.teamId !== "number") {
				ctx.addIssue({
					message: "forms:errors.regLinkedTeamRequired",
					path: ["teamId"],
				});
			}
		} else if (!data.pickUpName) {
			ctx.addIssue({
				message: "forms:errors.regTeamNameRequired",
				path: ["pickUpName"],
			});
		}

		const memberIds = data.members.map((member) => member.userId);
		if (memberIds.length !== new Set(memberIds).size) {
			ctx.addIssue({
				message: "forms:errors.usersMustBeUnique",
				path: ["members"],
			});
		}

		if (!memberIds.some((memberId) => String(memberId) === data.ownerId)) {
			ctx.addIssue({
				message: "forms:errors.regOwnerMustBeMember",
				path: ["ownerId"],
			});
		}
	}),
);

export type AdminRegistrationFormValues = v.InferInput<
	typeof adminRegistrationFormSchema
>;

/**
 * Modal form used to import an existing team's roster from another tournament
 * into the {@link adminRegistrationFormSchema} when adding a new team. Validated
 * client-side only — submitting prefills the registration form rather than
 * hitting the server.
 */
export const importTeamFormSchema = v.pipe(
	v.object({
		sourceTournamentId: tournamentSearchOptional({
			label: "labels.regImportSourceTournament",
		}),
		sourceTournamentTeamId: selectDynamic({
			label: "labels.regTeam",
		}),
	}),
	superRefine((data, ctx) => {
		if (typeof data.sourceTournamentId !== "number") {
			ctx.addIssue({
				message: "forms:errors.regImportTournamentRequired",
				path: ["sourceTournamentId"],
			});
		}
	}),
);

export type ImportTeamFormValues = v.InferInput<typeof importTeamFormSchema>;
