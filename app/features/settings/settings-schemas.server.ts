import * as v from "valibot";
import { updateMatchProfileSchema } from "./match-profile-schemas";
import { settingsEditSchema } from "./settings-schemas";

export const settingsActionSchema = v.union([
	settingsEditSchema,
	updateMatchProfileSchema,
]);
