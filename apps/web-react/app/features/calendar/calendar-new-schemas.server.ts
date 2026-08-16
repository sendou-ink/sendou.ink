import {
	calendarNewBaseSchema,
	calendarNewSyncRefine,
} from "./calendar-new-schemas";

export const calendarNewSchemaServer = calendarNewBaseSchema.superRefine(
	calendarNewSyncRefine,
);
