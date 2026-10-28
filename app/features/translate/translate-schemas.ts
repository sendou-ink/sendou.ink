import * as v from "valibot";
import { TRANSLATABLE_LANGUAGES } from "./translate-constants";

export const translateLanguageParamsSchema = v.object({
	language: v.picklist(TRANSLATABLE_LANGUAGES),
});
