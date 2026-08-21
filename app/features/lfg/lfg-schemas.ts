import * as v from "valibot";
import { LANGUAGE_OPTIONS } from "~/features/settings/match-profile-schemas";
import {
	checkboxGroup,
	idConstantOptional,
	selectDynamic,
	selectDynamicOptional,
	textArea,
} from "~/form/fields";
import { _action, id, superRefine } from "~/utils/schema";
import { LFG, TIMEZONES } from "./lfg-constants";

export const lfgNewSchema = v.pipe(
	v.object({
		postId: idConstantOptional(),
		type: selectDynamic({ label: "labels.type" }),
		timezone: selectDynamic({ label: "labels.timezone" }),
		postText: textArea({
			label: "labels.text",
			maxLength: LFG.MAX_TEXT_LENGTH,
		}),
		plusTierVisibility: selectDynamicOptional({
			label: "labels.visibility",
		}),
		languages: checkboxGroup({
			label: "labels.languages",
			items: LANGUAGE_OPTIONS,
		}),
	}),
	superRefine((data, ctx) => {
		if (!LFG.types.includes(data.type as (typeof LFG.types)[number])) {
			ctx.addIssue({
				message: "Invalid LFG type",
				path: ["type"],
			});
		}

		if (!TIMEZONES.includes(data.timezone)) {
			ctx.addIssue({
				message: "Invalid timezone",
				path: ["timezone"],
			});
		}
	}),
);

export const lfgActionSchema = v.union([
	v.object({
		_action: _action("DELETE_POST"),
		id,
	}),
	v.object({
		_action: _action("BUMP_POST"),
		id,
	}),
]);
