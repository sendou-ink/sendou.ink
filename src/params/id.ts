import type { ParamMatcher } from "@sveltejs/kit";

export const match: ParamMatcher = (param: string) => {
	return /^[1-9]\d*$/.test(param);
};
