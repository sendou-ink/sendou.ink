import { z } from "zod";
import { id } from "~/utils/zod";

export const validateImageSchema = z.object({
	imageId: id,
});
