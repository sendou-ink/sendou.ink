import type { ActionFunction } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import * as VodRepository from "~/features/vods/VodRepository.server";
import type { VideoBeingAdded } from "~/features/vods/vods-types";
import { secondsToHoursMinutesSecondString } from "~/features/vods/vods-utils";
import { requireRole } from "~/modules/permissions/guards.server";
import {
	badRequestIfFalsy,
	canAccessLohiEndpoint,
	parseBody,
} from "~/utils/remix.server";
import { resolveVodMatches } from "../core/VodMatches";
import { ingestVodBodySchema } from "../ingest-vod-schemas";

const DEFAULT_TEAM_SIZE = 4;

// xxx: verify is in use

/**
 * Creates a VoD (default type CAST) on /vods out of an emberz VoD scan: each
 * detected match (src/core/vod-matches.ts) becomes a VideoMatch after its
 * English mode/stage names are resolved to ids and its weapons validated
 * (see core/VodMatches.ts — incomplete matches are skipped). The Lohi-token
 * (CLI) path attributes the VoD to the given `submitterUserId`; a browser
 * request needs the VIDEO_ADDER role and is attributed to the logged-in user.
 */
export const action: ActionFunction = async ({ request }) => {
	const trusted = canAccessLohiEndpoint(request);
	const user = trusted ? null : requireUser();
	if (!trusted) requireRole("VIDEO_ADDER");

	const data = await parseBody({ request, schema: ingestVodBodySchema });

	const submitterUserId = badRequestIfFalsy(
		user?.id ?? data.submitterUserId ?? null,
	);
	badRequestIfFalsy(await UserRepository.findLeanById(submitterUserId));

	const teamSize = data.teamSize ?? DEFAULT_TEAM_SIZE;
	const { resolved, skippedCount } = resolveVodMatches({
		matches: data.matches,
		teamSize,
	});

	if (resolved.length === 0) {
		return {
			videoId: null,
			storedMatchesCount: 0,
			skippedMatchesCount: skippedCount,
		};
	}

	const video: VideoBeingAdded = {
		type: data.type,
		youtubeUrl: data.youtubeUrl,
		title: data.title,
		date: data.date,
		pov: undefined,
		teamSize,
		matches: resolved.map((match) => ({
			startsAt: secondsToHoursMinutesSecondString(match.startsAt),
			stageId: match.stageId,
			mode: match.mode,
			weapons: match.weapons,
		})),
	};

	const savedVideo = await VodRepository.insert({
		...video,
		submitterUserId,
		isValidated: true,
	});

	return {
		videoId: savedVideo.id,
		storedMatchesCount: resolved.length,
		skippedMatchesCount: skippedCount,
	};
};
