import { z } from "zod";
import { stringConstant, textAreaOptional, toggle } from "~/form/fields";
import { _action, id } from "~/utils/zod";

const noteFieldSchema = textAreaOptional({
	label: "labels.note",
	maxLength: 160,
});

export const addSubFormSchema = z.object({
	_action: stringConstant("ADD_SUB"),
	message: noteFieldSchema,
});

const stayAsSubFieldSchema = toggle({
	label: "labels.stayAsSub",
	bottomText: "bottomTexts.stayAsSub",
});

export const joinQueueFormSchema = z.object({
	_action: stringConstant("JOIN_QUEUE"),
	note: noteFieldSchema,
	stayAsSub: stayAsSubFieldSchema,
});

export const updateGroupFormSchema = z.object({
	_action: stringConstant("UPDATE_GROUP"),
	note: noteFieldSchema,
	stayAsSub: stayAsSubFieldSchema,
});

export const lookingSchema = z.union([
	joinQueueFormSchema,
	z.object({
		_action: _action("LIKE"),
		targetTeamId: id,
	}),
	z.object({
		_action: _action("UNLIKE"),
		targetTeamId: id,
	}),
	z.object({
		_action: _action("ACCEPT"),
		targetTeamId: id,
	}),
	z.object({
		_action: _action("GIVE_MANAGER"),
		userId: id,
	}),
	z.object({
		_action: _action("REMOVE_MANAGER"),
		userId: id,
	}),
	updateGroupFormSchema,
	z.object({
		_action: _action("LEAVE_GROUP"),
	}),
	addSubFormSchema,
	z.object({
		_action: _action("DELETE_SUB"),
		userId: id,
	}),
]);
