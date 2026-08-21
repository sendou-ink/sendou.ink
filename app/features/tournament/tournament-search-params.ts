import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import {
	codec,
	nullableCodec,
	SP,
} from "~/modules/search-params/search-params";

const isoDateCodec = codec(v.date(), {
	decode: (value) => new Date(value),
	encode: (date) => date.toISOString(),
});

export const tournamentSearchSearchParams = SearchParams.define({
	q: SP.param(v.pipe(v.string(), v.maxLength(100)), {
		default: "",
		loader: true,
	}),
	limit: SP.param(
		v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(25)),
		{
			default: 25,
			loader: true,
		},
	),
	minStartTime: SP.custom(nullableCodec(isoDateCodec), { loader: true }),
	maxStartTime: SP.custom(nullableCodec(isoDateCodec), { loader: true }),
});

export const tournamentJoinSearchParams = SearchParams.define({
	code: SP.param(v.nullable(v.string()), { loader: true }),
});

export const tournamentTeamsSearchParams = SearchParams.define({
	page: SP.page(),
});
