import { z } from "zod";
import { SEARCH_TYPES } from "./search-types";

export const searchParamsSchema = z.object({
	q: z.string().max(100).catch(""),
	type: z.enum(SEARCH_TYPES).catch("users"),
	limit: z.coerce.number().int().min(1).max(25).catch(10),
});
