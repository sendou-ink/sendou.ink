import { z } from "zod";
import { updateMatchProfileSchema } from "./match-profile-schemas";
import { settingsEditSchema } from "./settings-schemas";

export const settingsActionSchema = z.union([
	settingsEditSchema,
	updateMatchProfileSchema,
]);
