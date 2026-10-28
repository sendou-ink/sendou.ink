import * as v from "valibot";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { gameLanguages, languages } from "./config";

/** Switches the site's language or the language of in-game names, read by the i18n middleware on any page */
export const languageSearchParams = SearchParams.define({
	lng: SP.param(v.nullable(v.picklist(languages.map((lang) => lang.code))), {
		loader: true,
	}),
	gameLng: SP.param(
		v.nullable(v.picklist(gameLanguages.map((lang) => lang.code))),
		{ loader: true },
	),
});
