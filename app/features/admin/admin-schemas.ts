import { z } from "zod";
import { friendCode } from "~/utils/zod";

export const adminActionSearchParamsSchema = z.object({
	friendCode,
});
