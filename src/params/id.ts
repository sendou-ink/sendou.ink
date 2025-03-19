import type { ParamMatcher } from "@sveltejs/kit";
import * as v from "valibot";

// TODO: first should be v.string()
const schema = v.pipe(v.number(), v.integer(), v.minValue(1));

export const match: ParamMatcher = (param: string) => {
	return v.safeParse(schema, param).success;
};
