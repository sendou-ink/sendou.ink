import * as v from "valibot";

export const MonthYearSchema = v.object({
	month: v.pipe(v.number(), v.integer(), v.gtValue(0), v.ltValue(13)),
	year: v.pipe(v.number(), v.integer(), v.gtValue(2022), v.ltValue(2100)),
});
export type MonthYear = v.InferOutput<typeof MonthYearSchema>;
