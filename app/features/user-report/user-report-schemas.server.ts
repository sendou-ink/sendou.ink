import * as v from "valibot";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import { USER_REPORT_CATEGORIES } from "./user-report-constants";
import { reportUserSchema } from "./user-report-schemas";

export const reportUserSchemaServer = v.objectAsync({
	...reportUserSchema.entries,
	// the dialog also offers a category that only shows guidance, never a report
	category: v.picklist(USER_REPORT_CATEGORIES),
	// cast to the concrete value type: the field's nullability makes its inferred
	// type a union the async pipe can't resolve
	matchId: v.pipeAsync(
		reportUserSchema.entries.matchId as v.GenericSchema<unknown, string | null>,
		v.checkAsync(async (matchId) => {
			if (!matchId) return true;

			const id = Number(matchId);
			if (!Number.isInteger(id) || id <= 0) return false;

			return SQMatchRepository.exists(id);
		}, "forms:errors.matchNotFound"),
		v.transform((matchId) => (matchId ? Number(matchId) : null)),
	),
});
