import { z } from "zod";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { SHORT_NANOID_LENGTH } from "~/utils/id";

export const associationsSearchParams = SearchParams.define({
	inviteCode: SP.param(z.string().length(SHORT_NANOID_LENGTH).nullable(), {
		loader: true,
	}),
});
