import { z } from "zod";
import {
	array,
	customField,
	idConstantOptional,
	textAreaOptional,
	toggle,
	userSearchOptional,
} from "~/form/fields";
import { id } from "~/utils/zod";
import { ART } from "./art-constants";
import { artImageValue } from "./art-image";

const artTags = z
	.array(
		z.object({
			name: z.string().min(1).max(ART.TAG_MAX_LENGTH).optional(),
			id: id.optional(),
		}),
	)
	.max(ART.TAGS_MAX_LENGTH);

export const artFormSchema = z
	.object({
		artId: idConstantOptional(),
		img: customField({ initialValue: null }, artImageValue),
		description: textAreaOptional({
			label: "labels.description",
			maxLength: ART.DESCRIPTION_MAX_LENGTH,
		}),
		tags: customField({ initialValue: [] }, artTags),
		linkedUsers: array({
			label: "labels.linkedUsers",
			bottomText: "bottomTexts.linkedUsers",
			max: ART.LINKED_USERS_MAX_LENGTH,
			field: userSearchOptional({ label: "labels.user" }),
		}),
		isShowcase: toggle({
			label: "labels.showcase",
			bottomText: "bottomTexts.showcase",
		}),
	})
	.superRefine((data, ctx) => {
		// existing art keeps its image, new art must bring one
		if (!data.artId && data.img?.type !== "NEW") {
			ctx.addIssue({
				path: ["img"],
				code: "custom",
				message: "forms:errors.required",
			});
		}
	});
