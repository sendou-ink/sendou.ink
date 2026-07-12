import JSONCrush from "jsoncrush";
import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { requireUser } from "~/features/auth/core/user.server";
import {
	type PrefillVodMatch,
	prefillVodMatches,
} from "~/features/ingest/core/VodMatches";
import { ingestVodPrefillSchema } from "~/features/ingest/ingest-vod-schemas";
import { notFoundIfFalsy } from "~/utils/remix.server";
import { actualNumber, id } from "~/utils/zod";
import * as VodRepository from "../VodRepository.server";
import type { videoMatchTypes } from "../vods-constants";
import {
	canEditVideo,
	secondsToHoursMinutesSecondString,
	vodToVideoBeingAdded,
} from "../vods-utils";

const newVodLoaderParamsSchema = z.object({
	vod: z.preprocess(actualNumber, id),
});

export const loader = async ({ url }: LoaderFunctionArgs) => {
	const user = requireUser();

	const params = newVodLoaderParamsSchema.safeParse(
		Object.fromEntries(url.searchParams),
	);

	if (!params.success) {
		return { vodToEdit: null, vodPrefill: vodPrefillFromSearchParams(url) };
	}

	const vod = notFoundIfFalsy(await VodRepository.findVodById(params.data.vod));
	const vodToEdit = vodToVideoBeingAdded(vod);

	if (
		!canEditVideo({
			submitterUserId: vod.submitterUserId,
			userId: user.id,
			povUserId:
				vodToEdit.pov?.type === "USER" ? vodToEdit.pov.userId : undefined,
		})
	) {
		return { vodToEdit: null, vodPrefill: null };
	}

	return { vodToEdit: { ...vodToEdit, id: vod.id }, vodPrefill: null };
};

export interface VodPrefill {
	type: (typeof videoMatchTypes)[number] | null;
	matches: (Omit<PrefillVodMatch, "startsAt"> & { startsAt: string })[];
}

/**
 * Parses the `ingest` search param the emberz VoD parser's "Upload to
 * sendou.ink" button fills (a JSONCrushed ingestVodPrefillSchema payload, see
 * ~/features/ingest/ingest-vod-schemas) into form-prefill data. Detection
 * misses stay null for the user to fill; a malformed param is ignored.
 */
function vodPrefillFromSearchParams(url: URL): VodPrefill | null {
	const param = url.searchParams.get("ingest");
	if (!param) return null;

	try {
		const parsed = ingestVodPrefillSchema.safeParse(
			JSON.parse(JSONCrush.uncrush(param)),
		);
		if (!parsed.success) return null;

		return {
			type: parsed.data.type ?? null,
			matches: prefillVodMatches(parsed.data.matches).map((match) => ({
				...match,
				startsAt: secondsToHoursMinutesSecondString(match.startsAt),
			})),
		};
	} catch {
		return null;
	}
}
