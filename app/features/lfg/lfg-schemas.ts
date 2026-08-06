import { z } from "zod";
import { LANGUAGE_OPTIONS } from "~/features/settings/match-profile-schemas";
import {
	checkboxGroup,
	idConstantOptional,
	selectDynamic,
	selectDynamicOptional,
	textArea,
} from "~/form/fields";
import { _action, id } from "~/utils/zod";
import { LFG, TIMEZONES } from "./lfg-constants";

export const lfgNewSchema = z
	.object({
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
	})
	.refine(
		(data) => LFG.types.includes(data.type as (typeof LFG.types)[number]),
		{
			message: "Invalid LFG type",
			path: ["type"],
		},
	)
	.refine((data) => TIMEZONES.includes(data.timezone), {
		message: "Invalid timezone",
		path: ["timezone"],
	});

export const lfgActionSchema = z.union([
	z.object({
		_action: _action("DELETE_POST"),
		id,
	}),
	z.object({
		_action: _action("BUMP_POST"),
		id,
	}),
]);
