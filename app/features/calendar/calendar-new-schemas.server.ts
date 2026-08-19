import * as v from "valibot";
import { superRefine } from "~/utils/zod";
import {
	calendarNewBaseSchema,
	calendarNewSyncRefine,
} from "./calendar-new-schemas";

export const calendarNewSchemaServer = v.pipe(
	calendarNewBaseSchema,
	superRefine(calendarNewSyncRefine),
);
