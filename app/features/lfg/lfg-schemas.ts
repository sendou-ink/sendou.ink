import { z } from "zod";
import { LANGUAGE_OPTIONS } from "~/features/sendouq-settings/q-settings-schemas";
import {
	checkboxGroup,
	idConstantOptional,
	selectDynamic,
	selectDynamicOptional,
	textAreaRequired,
} from "~/form/fields";
import { LFG, TIMEZONES } from "./lfg-constants";

export const lfgNewSchema = z
	.object({
		postId: idConstantOptional(),
		type: selectDynamic({ label: "labels.type" }),
		timezone: selectDynamic({ label: "labels.timezone" }),
		postText: textAreaRequired({
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
