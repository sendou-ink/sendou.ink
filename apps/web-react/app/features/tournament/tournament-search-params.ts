import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

const isoDateCodec = z.codec(z.string(), z.date(), {
	decode: (value, payload) => {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) {
			payload.issues.push({
				code: "custom",
				message: "Invalid date",
				input: value,
			});
			return z.NEVER;
		}
		return date;
	},
	encode: (date) => date.toISOString(),
});

export const tournamentSearchSearchParams = SearchParams.define({
	q: SP.param(z.string().max(100), { default: "", loader: true }),
	limit: SP.param(z.number().int().min(1).max(25), {
		default: 25,
		loader: true,
	}),
	minStartTime: SP.custom(isoDateCodec.nullable(), { loader: true }),
	maxStartTime: SP.custom(isoDateCodec.nullable(), { loader: true }),
});

export const tournamentJoinSearchParams = SearchParams.define({
	code: SP.param(z.string().nullable(), { loader: true }),
});

export const tournamentTeamsSearchParams = SearchParams.define({
	page: SP.page(),
});
