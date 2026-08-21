import * as v from "valibot";
import {
	array,
	customField,
	idConstantOptional,
	textAreaOptional,
	toggle,
	userSearchOptional,
} from "~/form/fields";
import { id, superRefine } from "~/utils/schema";
import { ART } from "./art-constants";
import { artImageValue } from "./art-image";

const artTags = v.pipe(
	v.array(
		v.object({
			name: v.optional(
				v.pipe(v.string(), v.minLength(1), v.maxLength(ART.TAG_MAX_LENGTH)),
			),
			id: v.optional(id),
		}),
	),
	v.maxLength(ART.TAGS_MAX_LENGTH),
);

const artFormFields = {
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
};

export const artFormSchema = v.pipe(
	v.object(artFormFields),
	superRefine((data, ctx) => {
		// existing art keeps its image, new art must bring one
		if (!data.artId && data.img?.type !== "NEW") {
			ctx.addIssue({
				path: ["img"],
				message: "forms:errors.required",
			});
		}
	}),
);
