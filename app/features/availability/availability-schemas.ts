import { add, addWeeks, startOfWeek, sub } from "date-fns";
import * as v from "valibot";
import {
	checkboxGroupDynamic,
	datetime,
	idConstant,
	radioGroup,
	select,
	stringConstant,
	textField,
} from "~/form/fields";
import { _action, id, superRefine, type ValidationCtx } from "~/utils/schema";
import { AVAILABILITY } from "./availability-constants";

const DAY_MINUTES = 24 * 60;
const MAX_RANGES_PER_DAY = 24;

const dayTimeRangeSchema = v.pipe(
	v.object({
		start: v.pipe(
			v.number(),
			v.integer(),
			v.minValue(0),
			v.maxValue(DAY_MINUTES - 1),
		),
		end: v.pipe(
			v.number(),
			v.integer(),
			v.minValue(1),
			v.maxValue(2 * DAY_MINUTES),
		),
	}),
	v.check((range) => range.end > range.start, "Range must end after it starts"),
	v.check(
		(range) => range.end - range.start <= DAY_MINUTES,
		"Range must be at most a day long",
	),
);

const editorDaySchema = v.object({
	date: v.pipe(v.string(), v.isoDate()),
	ranges: v.pipe(v.array(dayTimeRangeSchema), v.maxLength(MAX_RANGES_PER_DAY)),
	note: v.pipe(
		v.string(),
		v.trim(),
		v.maxLength(AVAILABILITY.DAY_NOTE_MAX_LENGTH),
	),
});

export const saveWeekSchema = v.object({
	_action: _action("SAVE_WEEK"),
	days: v.pipe(v.array(editorDaySchema), v.length(7)),
});

export const dismissScheduleNudgeSchema = v.object({
	_action: _action("DISMISS_SCHEDULE_NUDGE"),
	revalidateRoot: v.optional(v.nullable(v.literal(true))),
});

export const eventsActionSchema = v.union([
	saveWeekSchema,
	dismissScheduleNudgeSchema,
]);

const teamEventDurationItems = [
	{ label: "options.duration.30m" as const, value: "30" },
	{ label: "options.duration.1h" as const, value: "60" },
	{ label: "options.duration.1h30m" as const, value: "90" },
	{ label: "options.duration.2h" as const, value: "120" },
	{ label: "options.duration.2h30m" as const, value: "150" },
	{ label: "options.duration.3h" as const, value: "180" },
	{ label: "options.duration.4h" as const, value: "240" },
	{ label: "options.duration.5h" as const, value: "300" },
	{ label: "options.duration.6h" as const, value: "360" },
] as const;

const teamEventFields = {
	name: textField({
		label: "labels.name",
		maxLength: AVAILABILITY.TEAM_EVENT_NAME_MAX_LENGTH,
	}),
	startsAt: datetime({
		label: "labels.start",
		min: () => sub(new Date(), { hours: 1 }),
		// end of the next week, the furthest the schedule shows, plus hours of slack for server-side
		// validation running in another timezone than the viewer's
		max: () =>
			add(
				startOfWeek(addWeeks(new Date(), AVAILABILITY.WEEK_HORIZON), {
					weekStartsOn: 1,
				}),
				{ hours: 14 },
			),
		minMessage: "errors.dateInPast",
		maxMessage: "errors.dateTooFarAway",
	}),
	duration: select({
		label: "labels.duration",
		items: [...teamEventDurationItems],
		initialValue: "60",
	}),
	participants: radioGroup({
		label: "labels.participants",
		items: [
			{ label: "options.participants.all", value: "ALL" },
			{ label: "options.participants.selected", value: "SELECTED" },
		],
	}),
	participantUserIds: checkboxGroupDynamic({
		label: "labels.members",
	}),
};

const validateSelectedParticipants = (
	data: { participants: "ALL" | "SELECTED"; participantUserIds: Array<string> },
	ctx: ValidationCtx,
) => {
	if (
		data.participants === "SELECTED" &&
		data.participantUserIds.length === 0
	) {
		ctx.addIssue({
			path: ["participantUserIds"],
			message: "forms:errors.required",
		});
	}
};

export const addTeamEventSchema = v.pipe(
	v.object({
		_action: stringConstant("ADD_EVENT"),
		...teamEventFields,
	}),
	superRefine((data, ctx) => validateSelectedParticipants(data, ctx)),
);

export const editTeamEventSchema = v.pipe(
	v.object({
		_action: stringConstant("EDIT_EVENT"),
		eventId: idConstant(),
		...teamEventFields,
	}),
	superRefine((data, ctx) => validateSelectedParticipants(data, ctx)),
);

const deleteTeamEventSchema = v.object({
	_action: _action("DELETE_EVENT"),
	eventId: id,
});

export const teamScheduleActionSchema = v.union([
	addTeamEventSchema,
	editTeamEventSchema,
	deleteTeamEventSchema,
]);
