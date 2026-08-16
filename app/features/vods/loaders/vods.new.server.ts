import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import {
	type PrefillVodMatch,
	prefillVodMatches,
} from "~/features/scanner-ingest/core/VodMatches";
import type { IngestVodPrefill } from "~/features/scanner-ingest/scanner-ingest-vod-schemas";
import { hasPermission } from "~/modules/permissions/utils";
import { notFoundIfNullish } from "~/utils/remix.server";
import * as VodRepository from "../VodRepository.server";
import type { videoMatchTypes } from "../vods-constants";
import { vodsNewSearchParams } from "../vods-search-params";
import {
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

	if (!hasPermission(vod, "EDIT", user)) {
		return { vodToEdit: null, vodPrefill: null };
	}

	return { vodToEdit: { ...vodToEdit, id: vod.id }, vodPrefill: null };
};

export interface VodPrefill {
	type: (typeof videoMatchTypes)[number] | null;
	matches: (Omit<PrefillVodMatch, "startsAt"> & { startsAt: string })[];
}

/**
 * Maps the `ingest` search param the scanner VoD tab's "Add VoD" button
 * fills (an ingestVodPrefillSchema payload, see
 * ~/features/scanner-ingest/scanner-ingest-vod-schemas) into form-prefill data. Detection
 * misses stay null for the user to fill; a malformed param has already
 * decoded to null.
 */
function vodPrefillFromIngestParam(
	ingest: IngestVodPrefill | null,
): VodPrefill | null {
	if (!ingest) return null;

	return {
		type: ingest.type ?? null,
		matches: prefillVodMatches(ingest.matches).map((match) => ({
			...match,
			startsAt: secondsToHoursMinutesSecondString(match.startsAt),
		})),
	};
}
