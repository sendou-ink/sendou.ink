import { z } from "zod";
import { stringConstant, textAreaOptional, toggle } from "~/form/fields";
import { _action, id } from "~/utils/zod";
import { TOURNAMENT_LFG } from "./tournament-lfg-constants";

const lfgNoteField = textAreaOptional({
	label: "labels.note",
	maxLength: TOURNAMENT_LFG.PUBLIC_NOTE_MAX_LENGTH,
});

const lfgStayAsSubField = toggle({
	label: "labels.stayAsSub",
	bottomText: "bottomTexts.stayAsSub",
});

export const joinQueueFormSchema = z.object({
	_action: stringConstant("JOIN_QUEUE"),
	note: lfgNoteField,
	stayAsSub: lfgStayAsSubField,
});

export const updateGroupFormSchema = z.object({
	_action: stringConstant("UPDATE_GROUP"),
	note: lfgNoteField,
	stayAsSub: lfgStayAsSubField,
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
	z.object({
		_action: _action("ADD_SUB"),
		message: z.string().max(TOURNAMENT_LFG.PUBLIC_NOTE_MAX_LENGTH).optional(),
	}),
	z.object({
		_action: _action("DELETE_SUB"),
		userId: id,
	}),
]);
