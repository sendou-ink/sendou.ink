import { z } from "zod";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import { reportUserSchema } from "./user-report-schemas";

export const reportUserSchemaServer = z.object({
	...reportUserSchema.shape,
	// cast to the concrete value type: the field's `.nullable()` makes its inferred
	// type a union that Zod's `.refine` overload can't resolve
	matchId: (reportUserSchema.shape.matchId as z.ZodType<string | null>)
		.refine(
			async (matchId) => {
				if (!matchId) return true;

				const id = Number(matchId);
				if (!Number.isInteger(id) || id <= 0) return false;

				return SQMatchRepository.exists(id);
			},
			{ message: "forms:errors.matchNotFound" },
		)
		.transform((matchId) => (matchId ? Number(matchId) : null)),
});
