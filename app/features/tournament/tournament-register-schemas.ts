import * as v from "valibot";
import {
	image,
	selectDynamicOptional,
	stringConstant,
	textFieldOptional,
	toggle,
} from "~/form/fields";
import { superRefine } from "~/utils/schema";
import { TOURNAMENT } from "./tournament-constants";

export const registerTeamFormSchema = v.pipe(
	v.object({
		_action: stringConstant("UPSERT_TEAM"),
		/** `String(teamId)` of one of the user's sendou.ink teams, or null for a pickup team. */
		teamId: selectDynamicOptional({ label: "labels.regSignUpAs" }),
		pickUpName: textFieldOptional({
			label: "labels.regPickUpName",
			maxLength: TOURNAMENT.TEAM_NAME_MAX_LENGTH,
		}),
		/** Pickup team logo. Linked teams source their logo from the sendou.ink team instead. */
		logo: image({ label: "labels.logo", autoValidate: true }),
		prefersNotToHost: toggle({ label: "labels.regPrefersNotToHost" }),
	}),
	superRefine((data, ctx) => {
		if (!data.teamId && !data.pickUpName) {
			ctx.addIssue({
				message: "forms:errors.regTeamNameRequired",
				path: ["pickUpName"],
			});
		}
	}),
);

export type RegisterTeamFormValues = v.InferInput<
	typeof registerTeamFormSchema
>;
