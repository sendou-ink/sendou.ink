import { z } from "zod/v4";
import { friendCode } from "~/utils/zod";

export const adminActionSearchParamsSchema = z.object({
	friendCode,
});
