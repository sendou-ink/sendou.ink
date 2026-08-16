import { z } from "zod";
import { FRIEND_CODE_REGEXP } from "~/features/sendouq/q-constants";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

export const adminSearchParams = SearchParams.define({
	friendCode: SP.param(z.string().regex(FRIEND_CODE_REGEXP).nullable(), {
		loader: true,
	}),
});
