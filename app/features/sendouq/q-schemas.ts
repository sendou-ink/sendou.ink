import { z } from "zod";
import { stringConstant, textAreaOptional } from "~/form/fields";
import { SENDOUQ } from "./q-constants";

export const updateGroupNoteSchema = z.object({
	_action: stringConstant("UPDATE_NOTE"),
	value: textAreaOptional({
		label: "labels.note",
		maxLength: SENDOUQ.OWN_PUBLIC_NOTE_MAX_LENGTH,
	}),
});
