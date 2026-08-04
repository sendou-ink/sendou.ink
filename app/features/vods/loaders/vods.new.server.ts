import JSONCrush from "jsoncrush";
import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import {
	type PrefillVodMatch,
	prefillVodMatches,
} from "~/features/ingest/core/VodMatches";
import { ingestVodPrefillSchema } from "~/features/ingest/ingest-vod-schemas";
import { notFoundIfNullish } from "~/utils/remix.server";
import * as VodRepository from "../VodRepository.server";
import type { videoMatchTypes } from "../vods-constants";
import { vodsNewSearchParams } from "../vods-search-params";
import {
	canEditVideo,
	secondsToHoursMinutesSecondString,
	vodToVideoBeingAdded,
} from "../vods-utils";

export const loader = async ({ url }: LoaderFunctionArgs) => {
	const user = requireUser();

	const { vod: vodId, ingest } = vodsNewSearchParams.parse(url);

	if (vodId === null) {
		return { vodToEdit: null, vodPrefill: vodPrefillFromIngestParam(ingest) };
	}

	const vod = notFoundIfNullish(await VodRepository.findVodById(vodId));
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
function vodPrefillFromIngestParam(param: string | null): VodPrefill | null {
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
