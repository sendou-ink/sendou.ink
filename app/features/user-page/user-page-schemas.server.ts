import { z } from "zod/v4";
import { safeJSONParse } from "~/utils/zod";

// xxx: placeholder, make actual
export const widgetsEditSchema = z.object({
	widgets: z.preprocess(
		safeJSONParse,
		z
			.array(
				z.object({
					id: z.enum([
						"bio",
						"badges-owned",
						"teams",
						"organizations",
						"peak-sp",
						"peak-xp",
					]),
					settings: z.any().optional(),
				}),
			)
			.max(9), // 5 main + 4 side
	),
});
