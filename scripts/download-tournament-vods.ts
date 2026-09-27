/**
 * Downloads the match VoDs of a tournament with yt-dlp, trimmed to each match. Starts from the same timestamp
 * the VoD link on the site points to and ends shortly after the last game of the match was reported.
 *
 * Usage: pnpm vods:download <tournament id or url> [--include-winless] [--dry-run]
 *
 * VoDs of teams that won no sets (e.g. went 0-2) are skipped unless --include-winless is passed.
 * Files go to scripts/output/vods/<tournament id>/<match id>-<twitch account>.mp4 and existing ones are not redownloaded.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as R from "remeda";
import * as TournamentMatchVodRepository from "~/features/tournament-bracket/TournamentMatchVodRepository.server";
import { vodTimestampOffsetSeconds } from "~/routines/syncTournamentVods";
import { invariant } from "~/utils/invariant";
import { logger } from "~/utils/logger";

const SECONDS_AFTER_LAST_REPORT = 30;

const OUTPUT_ROOT = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"output",
	"vods",
);

const cliArgs = process.argv.slice(2);
const tournamentId = parseTournamentId(
	cliArgs.find((arg) => !arg.startsWith("--")),
);
const includeWinless = cliArgs.includes("--include-winless");
const dryRun = cliArgs.includes("--dry-run");

const vods =
	await TournamentMatchVodRepository.findAllForDownloadByTournamentId(
		tournamentId,
	);
const outputDir = path.join(OUTPUT_ROOT, String(tournamentId));
fs.mkdirSync(outputDir, { recursive: true });

const sectionsToDownload: Array<{
	name: string;
	platformVideoId: string;
	start: number;
	end: number;
}> = [];

for (const vod of vods) {
	const name = `${vod.matchId}-${vod.account}`;

	if (!includeWinless && vod.povTeamSetWins === 0) {
		logger.info(`Skipping ${name}: team won no sets`);
		continue;
	}

	const section = matchSection(vod);
	if (!section) {
		logger.info(`Skipping ${name}: match has no reported games`);
		continue;
	}

	if (fs.existsSync(finalFilePath(name))) {
		logger.info(`Skipping ${name}: already downloaded`);
		continue;
	}

	sectionsToDownload.push({
		name,
		platformVideoId: vod.platformVideoId,
		...section,
	});
}

const failed: string[] = [];
let downloadedCount = 0;

for (const [platformVideoId, sections] of Object.entries(
	R.groupBy(sectionsToDownload, (section) => section.platformVideoId),
)) {
	const url = `https://www.twitch.tv/videos/${platformVideoId}`;
	for (const section of sections) {
		logger.info(
			`${dryRun ? "Would download" : "Downloading"} ${section.name} (${url} ${section.start}s-${section.end}s)`,
		);
	}
	if (dryRun) continue;

	spawnSync(
		"yt-dlp",
		[
			...sections.flatMap((section) => [
				"--download-sections",
				`*${section.start}-${section.end}`,
			]),
			"-o",
			path.join(outputDir, `${platformVideoId}-%(section_start)d.mp4`),
			url,
		],
		{ stdio: "inherit" },
	);

	for (const section of sections) {
		const sectionFilePath = path.join(
			outputDir,
			`${platformVideoId}-${section.start}.mp4`,
		);
		if (fs.existsSync(sectionFilePath)) {
			fs.renameSync(sectionFilePath, finalFilePath(section.name));
			downloadedCount++;
		} else {
			failed.push(section.name);
		}
	}
}

logger.info(`Downloaded ${downloadedCount} VoDs to ${outputDir}`);
if (failed.length > 0) {
	logger.error(`Failed to download: ${failed.join(", ")}`);
	process.exitCode = 1;
}

function finalFilePath(name: string) {
	return path.join(outputDir, `${name}.mp4`);
}

function parseTournamentId(arg: string | undefined) {
	const id = Number(arg?.match(/\/to\/(\d+)/)?.[1] ?? arg);
	invariant(
		Number.isInteger(id) && id > 0,
		"tournament id or url is required (argument 1)",
	);

	return id;
}

function matchSection(
	vod: Parameters<typeof vodTimestampOffsetSeconds>[0] & {
		timestampSeconds: number;
		startedAt: number | null;
		lastGameReportedAt: number | null;
	},
) {
	if (vod.startedAt === null || vod.lastGameReportedAt === null) return null;

	const matchStartInVod = vod.timestampSeconds - vodTimestampOffsetSeconds(vod);

	return {
		start: vod.timestampSeconds,
		end:
			matchStartInVod +
			(vod.lastGameReportedAt - vod.startedAt) +
			SECONDS_AFTER_LAST_REPORT,
	};
}
