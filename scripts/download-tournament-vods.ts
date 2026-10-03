/**
 * Downloads the match VoDs of a tournament with yt-dlp, trimmed to each match. Starts from the same timestamp
 * the VoD link on the site points to and ends shortly after the last game of the match was reported.
 *
 * Usage: pnpm vods:download <tournament id or url> [--include-winless] [--dry-run]
 *
 * VoDs of teams that won no sets (e.g. went 0-2) are skipped unless --include-winless is passed.
 * Files go to scripts/output/vods/<tournament id>/<match id>-<twitch account>.mp4 and existing ones are not redownloaded.
 * Next to them go tournament.json and the logos it names, for the scanner's tournament montage (`/scanner?view=montage`, dev only).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as R from "remeda";
import {
	MONTAGE_MANIFEST_FILE,
	type MontageManifest,
} from "~/features/scanner/core/montage";
import * as Standings from "~/features/tournament/core/Standings";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentMatchVodRepository from "~/features/tournament-bracket/TournamentMatchVodRepository.server";
import { vodTimestampOffsetSeconds } from "~/routines/syncTournamentVods";
import { invariant } from "~/utils/invariant";
import { logger } from "~/utils/logger";
import { resolveAvatarUrl, userPage } from "~/utils/urls";

const SECONDS_AFTER_LAST_REPORT = 30;
const MONTAGE_TOP_TEAMS_COUNT = 8;

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

if (!dryRun) await writeMontageManifest();

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

async function writeMontageManifest() {
	const [tournament, fullTeams] = await Promise.all([
		tournamentFromDB(tournamentId),
		TournamentRepository.findTeamsFullByTournamentId(tournamentId),
	]);
	const fullTeamById = new Map(fullTeams.map((team) => [team.id, team]));
	const standings = Standings.tournamentStandings(tournament);
	const topStandings = (
		standings.type === "single"
			? standings.standings
			: (standings.standings[0]?.standings ?? [])
	).slice(0, MONTAGE_TOP_TEAMS_COUNT);

	const teamOf = async (teamId: number) => {
		const team = tournament.teamById(teamId);
		invariant(team, `Team ${teamId} not found`);

		return {
			id: team.id,
			name: team.name,
			logo: await downloadImage(team.logoUrl, `team-${team.id}`),
		};
	};

	const manifest: MontageManifest = {
		tournamentId,
		name: tournament.ctx.name,
		startsAt: tournament.ctx.startsAt.getTime(),
		logo: await downloadImage(tournament.ctx.logoUrl, "logo"),
		tier: tournament.ctx.tier ?? null,
		organization: tournament.ctx.organization
			? {
					name: tournament.ctx.organization.name,
					logo: await downloadImage(
						tournament.ctx.organization.logoUrl,
						"organization",
					),
				}
			: null,
		teamsCount: tournament.ctx.teams.length,
		playersCount: tournament.participatedUserIds?.length ?? 0,
		topTeams: await Promise.all(
			topStandings.map(async (standing) => {
				const playedUserIds = new Set(
					tournament.participatedPlayerUserIdsByTeamId(standing.team.id),
				);

				return {
					...(await teamOf(standing.team.id)),
					placement: standing.placement,
					players: (fullTeamById.get(standing.team.id)?.members ?? [])
						.filter((member) => playedUserIds.has(member.userId))
						.map((member) => ({
							name: member.username,
							countryCode: member.country,
						})),
				};
			}),
		),
		vods: await Promise.all(
			vods.map(async (vod) => {
				const team =
					vod.povTeamId === null ? null : tournament.teamById(vod.povTeamId);
				const streamer =
					vod.povTeamId === null
						? undefined
						: fullTeamById
								.get(vod.povTeamId)
								?.members.find((member) => member.userId === vod.userId);
				const match = tournament.brackets
					.flatMap((bracket) => (bracket.preview ? [] : bracket.data.match))
					.find((candidate) => candidate.id === vod.matchId);
				const { roundNameWithoutMatchIdentifier, bracketName } =
					tournament.matchContextNamesById(vod.matchId);

				return {
					file: `${vod.matchId}-${vod.account}.mp4`,
					matchId: vod.matchId,
					account: vod.account,
					team: team ? { id: team.id, name: team.name } : null,
					roundName: roundNameWithoutMatchIdentifier ?? null,
					bracketName: bracketName ?? null,
					teams: await Promise.all(
						[match?.opponent1?.id, match?.opponent2?.id]
							.filter((teamId) => typeof teamId === "number")
							.map(teamOf),
					),
					pov: streamer
						? {
								name: streamer.username,
								profilePath: userPage(streamer),
								avatar: await downloadImage(
									resolveAvatarUrl({ ...streamer, size: "sm" }) ?? null,
									`user-${streamer.userId}`,
								),
							}
						: null,
				};
			}),
		),
	};

	fs.writeFileSync(
		path.join(outputDir, MONTAGE_MANIFEST_FILE),
		JSON.stringify(manifest, null, 2),
	);
}

/** Saves the image next to the VoDs, returning its file name; null when there is none or it can't be fetched. */
async function downloadImage(url: string | null, baseName: string) {
	if (!url) return null;

	const fileName = `${baseName}${path.extname(new URL(url).pathname)}`;
	const filePath = path.join(outputDir, fileName);
	if (fs.existsSync(filePath)) return fileName;

	const response = await fetch(url);
	if (!response.ok) {
		logger.error(`Failed to download ${url}: ${response.status}`);
		return null;
	}
	fs.writeFileSync(filePath, Buffer.from(await response.arrayBuffer()));

	return fileName;
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
