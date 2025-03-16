import { z } from "zod";
import {
	checkboxValueToDbBoolean,
	dbBoolean,
	falsyToNull,
	id,
	processMany,
	removeDuplicates,
	safeJSONParse,
} from "~/utils/zod";
import { ART } from "./art-constants";

const description = z.preprocess(
	falsyToNull,
	z.string().max(ART.DESCRIPTION_MAX_LENGTH).nullable(),
);
const linkedUsers = z.preprocess(
	processMany(safeJSONParse, removeDuplicates),
	z.array(id).max(ART.LINKED_USERS_MAX_LENGTH),
);
const tags = z.preprocess(
	safeJSONParse,
	z
		.array(
			z.object({
				name: z.string().min(1).max(ART.TAG_MAX_LENGTH).optional(),
				id: id.optional(),
			}),
		)
		.max(ART.TAG_MAX_LENGTH),
);
export const newArtSchema = z.object({
	description,
	linkedUsers,
	tags,
});

export const editArtSchema = z.object({
	description,
	linkedUsers,
	tags,
	isShowcase: z.preprocess(checkboxValueToDbBoolean, dbBoolean),
});

export const deleteArtSchema = z.object({
	id,
});
