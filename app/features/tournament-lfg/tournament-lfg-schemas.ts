import * as v from "valibot";
import {
	stringConstant,
	textAreaOptional,
	toggle,
	userSearch,
} from "~/form/fields";
import { _action, id } from "~/utils/schema";

const noteFieldSchema = textAreaOptional({
	label: "labels.note",
	maxLength: 160,
});

export const addSubFormSchema = v.object({
	_action: stringConstant("ADD_SUB"),
	message: noteFieldSchema,
});

export const addSubForUserFormSchema = v.object({
	...addSubFormSchema.entries,
	_action: stringConstant("ADD_SUB_FOR_USER"),
	userId: userSearch({ label: "labels.user" }),
});

const stayAsSubFieldSchema = toggle({
	label: "labels.stayAsSub",
	bottomText: "bottomTexts.stayAsSub",
});

export const joinQueueFormSchema = v.object({
	_action: stringConstant("JOIN_QUEUE"),
	note: noteFieldSchema,
	stayAsSub: stayAsSubFieldSchema,
});

export const updateGroupFormSchema = v.object({
	_action: stringConstant("UPDATE_GROUP"),
	note: noteFieldSchema,
	stayAsSub: stayAsSubFieldSchema,
});

export const lookingSchema = v.union([
	v.object({
		_action: _action("JOIN_QUEUE"),
		note: v.optional(noteFieldSchema),
		stayAsSub: v.optional(stayAsSubFieldSchema),
	}),
	v.object({
		_action: _action("LIKE"),
		targetTeamId: id,
	}),
	v.object({
		_action: _action("UNLIKE"),
		targetTeamId: id,
	}),
	v.object({
		_action: _action("ACCEPT"),
		targetTeamId: id,
	}),
	v.object({
		_action: _action("GIVE_MANAGER"),
		userId: id,
	}),
	v.object({
		_action: _action("REMOVE_MANAGER"),
		userId: id,
	}),
	updateGroupFormSchema,
	v.object({
		_action: _action("LEAVE_GROUP"),
	}),
	v.object({
		_action: _action("DELETE_GROUP"),
		userId: id,
	}),
	addSubFormSchema,
	addSubForUserFormSchema,
	v.object({
		_action: _action("DELETE_SUB"),
		userId: id,
	}),
]);
