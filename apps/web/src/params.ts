import { defineParams } from "@sveltejs/kit/params";

export const params = defineParams({
	integer: (param) => {
		if (!/^\d+$/.test(param)) return;
		return Number(param);
	},
});
