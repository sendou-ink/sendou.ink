import * as v from "valibot";
import { stringConstant, textAreaOptional, textField } from "~/form/fields";
import {
	FRIEND_CODE_MAX_LENGTH,
	FRIEND_CODE_REGEXP,
	SENDOUQ,
} from "./q-constants";

export const updateGroupNoteSchema = v.object({
	_action: stringConstant("UPDATE_NOTE"),
	value: textAreaOptional({
		label: "labels.note",
		maxLength: SENDOUQ.OWN_PUBLIC_NOTE_MAX_LENGTH,
	}),
});

/**
 * Friend code as the user typed it, with the "SW-" prefix and dashes optional.
 * Pass through `normalizeFriendCode` before storing it.
 */
export const friendCodeField = textField({
	label: "labels.friendCode",
	maxLength: FRIEND_CODE_MAX_LENGTH,
	leftAddon: "SW-",
	placeholder: "placeholders.friendCode",
	regExp: {
		pattern: FRIEND_CODE_REGEXP,
		message: "forms:errors.invalidFriendCode",
	},
});

export const addFriendCodeSchema = v.object({
	_action: stringConstant("ADD_FRIEND_CODE"),
	friendCode: friendCodeField,
});
