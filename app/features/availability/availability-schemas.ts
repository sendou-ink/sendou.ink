import * as v from "valibot";
import { _action } from "~/utils/schema";
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
