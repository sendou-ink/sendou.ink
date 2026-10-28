/**
 * The tournament montage (dev only, `view=montage`), a module singleton like
 * the VoD scan it drives. Opening a folder written by `pnpm vods:download`
 * (the File System Access API's directory picker) reads its manifest; every
 * VoD in it is scanned in turn through `startVodScan` (saved like any file
 * scan, no clips cut) and its streaks meeting the criteria (`montageWindows`:
 * min splats and a length cap per splat count, kept in localStorage) become
 * candidates of the top teams they can play under (a cast's go under
 * either side). Each pick plays under one team's card. The scanned games, the picks and
 * the folder's handle live in IndexedDB (`store/montages.ts`): a reload
 * restores the latest montage at once, and the folder reconnects on its own
 * when the browser kept the permission, else with one click. Rendering
 * stitches the intro card, then each top team's card and picks counting
 * down to the winner (`capture/montage-render.ts`); the cards and each clip's ribbon are drawn
 * by the page (`MontageGraphics.tsx`), which registers how through
 * `setMontageGraphicCapture`. An optional music file replaces the game
 * sound for the whole video.
 */
import { useSyncExternalStore } from "react";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import { downloadBlob } from "~/utils/download";
import type { CardRevealRect, RevealStyle } from "../capture/montage-overlays";
import {
	type MontagePart,
	type MontageRenderProgress,
	renderMontage,
} from "../capture/montage-render";
import { extractVodClip, vodFrameThumbnail } from "../capture/vod-clips";
import { povDeathTimes } from "../core/clips/scoring";
import { buildScannerMatches } from "../core/match-builder";
import {
	candidateTeamIds,
	DEFAULT_MONTAGE_CRITERIA,
	INTRO_CARD_SECONDS,
	MONTAGE_MANIFEST_FILE,
	type MontageCandidate,
	type MontageCriteria,
	type MontageGame,
	type MontageManifest,
	type MontageManifestVod,
	type MontagePick,
	montageDuration,
	montageTeamSections,
	montageWindows,
	playbackDuration,
	playbackSegments,
	TEAM_CARD_SECONDS,
} from "../core/montage";
import type { ScannerMatch } from "../core/scanner-match";
import { montageCriteriaPersisted } from "../scanner-persisted";
import {
	latestMontage,
	loadMontage,
	putMontage,
	type StoredMontage,
} from "../store/montages";
import { listVods, loadVod, loadVodEvents } from "../store/vods";
import { describeError } from "./errors";
import { scannedTeamComps } from "./montage-comps";
import { cancelVodScan, startVodScan } from "./vod-scan";

export interface MontageFolder {
	manifest: MontageManifest;
	/** the manifest's VoDs found in the folder */
	vods: MontageManifestVod[];
	/** null while the folder isn't connected this visit (restored from the store) */
	files: Map<string, File> | null;
	directory: FileSystemDirectoryHandle | null;
}

export type MontageScan =
	| { state: "scanning"; file: string; index: number; total: number }
	| { state: "done"; failed: string[] };

/** What the page draws for the video; see `MontageGraphics.tsx`. */
export type MontageGraphic =
	/** `hideRevealed`: the team avatars' places left empty, for the renderer to reveal them in */
	| { kind: "intro"; hideRevealed?: boolean }
	/** a top team's card: placement, roster and comp; `hideRevealed` as for the intro, the roster's */
	| { kind: "team"; teamId: number; hideRevealed?: boolean }
	/** the results image on its own: every top team's roster and comp */
	| { kind: "results" }
	| {
			kind: "ribbon";
			vod: MontageManifestVod;
			weaponId: MainWeaponId | null;
	  };

/** resolves to the graphic as a PNG, with where its revealed items are */
type GraphicCapture = (graphic: MontageGraphic) => Promise<{
	image: Blob;
	revealRects: CardRevealRect[];
}>;

export type MontageRender =
	| ({ state: "rendering" } & MontageRenderProgress)
	| { state: "done"; error: string | null };

export interface MontageSnapshot {
	folder: MontageFolder | null;
	folderError: string | null;
	/** the games of the folder's scanned VoDs, by file name */
	scanned: ReadonlyMap<string, MontageGame[]>;
	criteria: MontageCriteria;
	/** every candidate meeting the criteria, best first */
	candidates: MontageCandidate[];
	/** in montage order within each team */
	picks: MontagePick[];
	/** plays under the whole video instead of the game sound */
	music: File | null;
	scan: MontageScan | null;
	render: MontageRender | null;
}

type DirectoryPicker = (options: {
	id: string;
	mode: "read";
}) => Promise<FileSystemDirectoryHandle>;

/** The permission calls Chromium has on handles but TypeScript's DOM lib lacks. */
type PermissionedDirectory = FileSystemDirectoryHandle & {
	queryPermission(descriptor: { mode: "read" }): Promise<PermissionState>;
	requestPermission(descriptor: { mode: "read" }): Promise<PermissionState>;
};

type SaveFilePicker = (options: {
	suggestedName: string;
	types: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<FileSystemFileHandle>;

const PREVIEW_FRAME_WIDTH = 960;

const EMPTY: MontageSnapshot = {
	folder: null,
	folderError: null,
	scanned: new Map(),
	criteria: DEFAULT_MONTAGE_CRITERIA,
	candidates: [],
	picks: [],
	music: null,
	scan: null,
	render: null,
};

let snapshot = EMPTY;
const listeners = new Set<() => void>();
let restoreStarted = false;
let scanAbort = { aborted: false };
let renderAbort: AbortController | null = null;
let captureGraphic: GraphicCapture | null = null;
/** object URLs of the folder's images, released when another folder connects */
let imageUrls = new Map<File, string>();
const thumbnails = new Map<string, Promise<string | null>>();
/** one thumbnail decode at a time: a grid of cards would otherwise open every VoD at once */
let thumbnailQueue: Promise<unknown> = Promise.resolve();

/** The montage; the latest one is restored from the store on first use. */
export function useMontage(): MontageSnapshot {
	return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

/** Candidates not picked yet. */
export function availableCandidates(state: MontageSnapshot) {
	const pickedKeys = new Set(state.picks.map((pick) => pick.key));
	return state.candidates.filter((candidate) => !pickedKeys.has(candidate.key));
}

/** Opens a folder written by `pnpm vods:download` through the directory picker. */
export async function openMontageFolder(): Promise<void> {
	const picker = (window as Window & { showDirectoryPicker?: DirectoryPicker })
		.showDirectoryPicker;
	if (!picker) {
		set({ folderError: "Opening a folder needs Chrome" });
		return;
	}
	let directory: FileSystemDirectoryHandle;
	try {
		directory = await picker({ id: "scanner-montage", mode: "read" });
	} catch {
		// the picker was dismissed
		return;
	}
	await connect(directory);
}

/** Asks the browser again for the restored folder (needs the click's gesture). */
export async function reconnectMontageFolder(): Promise<void> {
	const directory = snapshot.folder?.directory as
		| PermissionedDirectory
		| null
		| undefined;
	if (!directory) return;
	if ((await directory.requestPermission({ mode: "read" })) !== "granted") {
		return;
	}
	await connect(directory);
}

/** Scans the folder's VoDs that have no games yet, one after another. */
export async function scanMontageVods(): Promise<void> {
	const folder = snapshot.folder;
	const files = folder?.files;
	if (!folder || !files || snapshot.scan?.state === "scanning") return;
	const abort = { aborted: false };
	scanAbort = abort;
	const queue = folder.vods.filter((vod) => !snapshot.scanned.has(vod.file));
	const failed: string[] = [];
	for (const [index, vod] of queue.entries()) {
		set({
			scan: { state: "scanning", file: vod.file, index, total: queue.length },
		});
		await startVodScan(files.get(vod.file)!, {
			telemetry: false,
			saveFrames: false,
			clips: false,
		});
		if (abort.aborted || snapshot.folder !== folder) return;
		if (!(await loadVod(vod.file))) {
			failed.push(vod.file);
			continue;
		}
		const games = await scannedGames(vod);
		set({ scanned: new Map([...snapshot.scanned, [vod.file, games]]) });
		persist();
	}
	set({ scan: { state: "done", failed } });
}

/** Stops the folder scan; the VoD being scanned is not saved. */
export function cancelMontageScan(): void {
	if (snapshot.scan?.state !== "scanning") return;
	scanAbort.aborted = true;
	cancelVodScan();
	set({ scan: null });
}

/** Changes what makes a clip candidate; picks already made stay as they are. */
export function updateMontageCriteria(patch: Partial<MontageCriteria>): void {
	const criteria = { ...snapshot.criteria, ...patch };
	set({ criteria });
	PersistedState.write(montageCriteriaPersisted, criteria);
}

/** Sets or clears the music that replaces the game sound. */
export function setMontageMusic(music: File | null): void {
	set({ music });
	persist();
}

/** Adds the candidate after the team's other picks. */
export function pickCandidate(
	candidate: MontageCandidate,
	teamId: number,
): void {
	setPicks([...snapshot.picks, { ...candidate, teamId }]);
}

export function unpickCandidate(key: string): void {
	setPicks(snapshot.picks.filter((pick) => pick.key !== key));
}

/** Swaps the pick with its neighbor among its team's picks, earlier (-1) or later (1). */
export function movePick(key: string, delta: -1 | 1): void {
	const pick = snapshot.picks.find((candidate) => candidate.key === key);
	if (!pick) return;
	const teamPicks = snapshot.picks.filter(
		(candidate) => candidate.teamId === pick.teamId,
	);
	const neighbor = teamPicks[teamPicks.indexOf(pick) + delta];
	if (!neighbor) return;
	setPicks(
		snapshot.picks.map((candidate) =>
			candidate === pick ? neighbor : candidate === neighbor ? pick : candidate,
		),
	);
}

/** A small JPEG data URL of the candidate's last kill; decoded once, one at a time. */
export function candidateThumbnail(
	candidate: MontageCandidate,
): Promise<string | null> {
	return candidateFrame(candidate, undefined);
}

/** The candidate's last kill at `PREVIEW_FRAME_WIDTH`, for the ribbon preview to sit on. */
export function candidatePreviewFrame(
	candidate: MontageCandidate,
): Promise<string | null> {
	return candidateFrame(candidate, PREVIEW_FRAME_WIDTH);
}

/** The candidate's footage as it is in the VoD (no fast-forward), for watching before picking. */
export async function candidatePreview(
	candidate: MontageCandidate,
): Promise<Blob | null> {
	const file = snapshot.folder?.files?.get(candidate.vod.file);
	if (!file) return null;
	const clip = await extractVodClip(file, {
		start: candidate.window.start,
		end: candidate.window.end,
		maxSeconds: candidate.window.end - candidate.window.start,
	});
	return clip.blob;
}

/**
 * Renders the cards and picks into an MP4, saved where the user picks (Chrome's save
 * dialog, opened first so the click still counts as the user's gesture) or,
 * without one, downloaded once done.
 */
export async function renderMontageVideo(): Promise<void> {
	const folder = snapshot.folder;
	const files = folder?.files;
	const picks = snapshot.picks;
	if (!folder || !files || snapshot.render?.state === "rendering") return;
	const { manifest } = folder;
	const fileName = `${fileSlug(manifest)}-montage.mp4`;
	const total = montageDuration(manifest.topTeams.length, picks);

	let writable: FileSystemWritableFileStream | null;
	try {
		writable = await openSaveFile(fileName);
	} catch {
		// the save dialog was dismissed
		return;
	}
	const controller = new AbortController();
	renderAbort = controller;
	set({
		render: { state: "rendering", done: 0, total },
	});
	try {
		const captureCurrent = captureGraphic;
		if (!captureCurrent) throw new Error("the montage view isn't mounted");
		const capture = async (graphic: MontageGraphic) =>
			createImageBitmap((await captureCurrent(graphic)).image);
		const captureCard = async (
			card: Extract<MontageGraphic, { kind: "intro" | "team" }>,
			style: RevealStyle,
			seconds: number,
		): Promise<MontagePart> => {
			const shown = await captureCurrent(card);
			return {
				kind: "card",
				image: await capture({ ...card, hideRevealed: true }),
				seconds,
				reveal: {
					style,
					image: await createImageBitmap(shown.image),
					rects: shown.revealRects,
				},
			};
		};
		const parts: MontagePart[] = [
			await captureCard({ kind: "intro" }, "pop", INTRO_CARD_SECONDS),
		];
		for (const section of montageTeamSections(manifest.topTeams, picks)) {
			parts.push(
				await captureCard(
					{ kind: "team", teamId: section.team.id },
					"rise",
					TEAM_CARD_SECONDS,
				),
			);
			for (const pick of section.picks) {
				const file = files.get(pick.vod.file);
				if (!file) throw new Error(`${pick.vod.file} is not in the folder`);
				parts.push({
					kind: "clip",
					file,
					segments: playbackSegments(pick.window),
					ribbon: await capture({
						kind: "ribbon",
						vod: pick.vod,
						weaponId: pick.weaponId,
					}),
				});
			}
		}
		const blob = await renderMontage({
			parts,
			music: snapshot.music,
			writable,
			signal: controller.signal,
			onProgress: (progress) =>
				set({ render: { state: "rendering", ...progress } }),
		});
		if (blob) downloadBlob(fileName, blob);
		set({ render: { state: "done", error: null } });
	} catch (error) {
		set({
			render: {
				state: "done",
				error: controller.signal.aborted
					? "Rendering was cancelled"
					: describeError(error),
			},
		});
	} finally {
		renderAbort = null;
	}
}

/** Set by the mounted montage view: how a graphic becomes a video frame image. */
export function setMontageGraphicCapture(capture: GraphicCapture | null): void {
	captureGraphic = capture;
}

/** An image of the connected folder as a URL the graphics can show. */
export function montageImageUrl(name: string | null): string | undefined {
	const file = name ? snapshot.folder?.files?.get(name) : undefined;
	if (!file) return undefined;
	let url = imageUrls.get(file);
	if (!url) {
		url = URL.createObjectURL(file);
		imageUrls.set(file, url);
	}
	return url;
}

/** Downloads the graphic as a PNG, as the video (or for `results`, the image export) captures it. */
export async function downloadMontageGraphic(
	graphic: MontageGraphic,
	name: string,
): Promise<void> {
	const folder = snapshot.folder;
	if (!folder?.files) throw new Error("reconnect the folder first");
	if (!captureGraphic) throw new Error("the montage view isn't mounted");
	downloadBlob(
		`${fileSlug(folder.manifest)}-${name}.png`,
		(await captureGraphic(graphic)).image,
	);
}

export function cancelMontageRender(): void {
	renderAbort?.abort();
}

/** The top teams' comps as the scans saw them, by team id. */
export function montageTeamComps(state: MontageSnapshot) {
	return state.folder
		? scannedTeamComps(state.folder.vods, state.scanned)
		: new Map<number, MainWeaponId[]>();
}

function candidateFrame(
	candidate: MontageCandidate,
	width: number | undefined,
): Promise<string | null> {
	const file = snapshot.folder?.files?.get(candidate.vod.file);
	if (!file) return Promise.resolve(null);
	const key = `${candidate.key}@${width ?? "thumbnail"}`;
	let frame = thumbnails.get(key);
	if (!frame) {
		frame = thumbnailQueue.then(() =>
			vodFrameThumbnail(file, candidate.window.t, width),
		);
		thumbnailQueue = frame;
		thumbnails.set(key, frame);
	}
	return frame;
}

function getSnapshot(): MontageSnapshot {
	if (!restoreStarted) {
		restoreStarted = true;
		void restore();
	}
	return snapshot;
}

/** The latest montage as stored, its folder connected when the browser still grants it. */
async function restore(): Promise<void> {
	const criteria = loadCriteria();
	const stored = await latestMontage().catch(() => undefined);
	if (!stored || snapshot.folder) {
		set({ criteria });
		return;
	}
	if (isOutdatedManifest(stored.manifest)) {
		set({ criteria, folderError: outdatedManifestError(stored.manifest) });
		return;
	}
	set({
		...EMPTY,
		criteria,
		folder: {
			manifest: stored.manifest,
			vods: stored.vods,
			files: null,
			directory: stored.directory,
		},
		scanned: new Map(Object.entries(stored.games)),
		music: stored.music ?? null,
	});
	set({ picks: currentPicks(stored.picks) });
	const directory = stored.directory as PermissionedDirectory | null;
	if (
		directory &&
		(await directory.queryPermission({ mode: "read" })) === "granted"
	) {
		await connect(directory);
	}
}

/**
 * Reads the folder's manifest and files, then its stored montage: games of
 * VoDs saved by a scan but missing from the store (scanned from the VoD
 * view, say) are built from their events.
 */
async function connect(directory: FileSystemDirectoryHandle): Promise<void> {
	cancelMontageScan();
	for (const url of imageUrls.values()) URL.revokeObjectURL(url);
	imageUrls = new Map();
	try {
		const { manifest, files } = await readFolder(directory);
		const vods = manifest.vods.filter((vod) => files.has(vod.file));
		const stored = await loadMontage(manifest.tournamentId);
		const scanned = new Map(Object.entries(stored?.games ?? {}));
		const saved = new Set((await listVods()).map((vod) => vod.name));
		for (const vod of vods) {
			// games stored before the POV weapon and lineups were kept are built again
			const games = scanned.get(vod.file);
			const stale = !games || games.some((game) => !("lineups" in game));
			if (stale && saved.has(vod.file)) {
				scanned.set(vod.file, await scannedGames(vod));
			}
		}
		set({
			...EMPTY,
			criteria: snapshot.criteria,
			folder: { manifest, vods, files, directory },
			scanned,
			music: stored?.music ?? null,
		});
		set({ picks: currentPicks(stored?.picks ?? []) });
		persist();
	} catch (error) {
		set({ folderError: describeError(error) });
	}
}

async function readFolder(directory: FileSystemDirectoryHandle) {
	const read = async (name: string) => {
		try {
			return await (await directory.getFileHandle(name)).getFile();
		} catch {
			return null;
		}
	};
	const manifestFile = await read(MONTAGE_MANIFEST_FILE);
	if (!manifestFile) {
		throw new Error(
			`No ${MONTAGE_MANIFEST_FILE} in the folder: pick a folder written by pnpm vods:download`,
		);
	}
	const manifest = JSON.parse(await manifestFile.text()) as MontageManifest;
	if (isOutdatedManifest(manifest)) {
		throw new Error(outdatedManifestError(manifest));
	}
	const names = new Set(
		[
			manifest.logo,
			manifest.organization?.logo ?? null,
			...manifest.teams.map((team) => team.logo),
			...manifest.topTeams.flatMap((team) => [
				team.logo,
				...team.players.map((player) => player.avatar),
			]),
			...manifest.vods.flatMap((vod) => [
				vod.file,
				vod.pov?.avatar ?? null,
				...vod.teams.map((team) => team.logo),
			]),
		].filter((name) => name !== null),
	);
	const files = new Map<string, File>();
	for (const name of names) {
		const file = await read(name);
		if (file) files.set(name, file);
	}
	return { manifest, files };
}

/** Written by an older `pnpm vods:download`, missing fields the montage needs. */
function isOutdatedManifest(manifest: MontageManifest): boolean {
	return (
		!manifest.teams ||
		manifest.vods.some((vod) => !vod.teams) ||
		manifest.topTeams.some((team) =>
			team.players.some((player) => !("avatar" in player)),
		)
	);
}

function outdatedManifestError(manifest: MontageManifest): string {
	return `${MONTAGE_MANIFEST_FILE} is from an older version: run pnpm vods:download ${manifest.tournamentId} again`;
}

async function scannedGames(vod: MontageManifestVod): Promise<MontageGame[]> {
	const events = await loadVodEvents(vod.file);
	return buildScannerMatches(events).map(({ match, sources }) => ({
		kills: match.kills,
		mode: match.mode,
		stage: match.stage,
		povWeaponId: match.pov
			? (match.teams[match.pov.team].players[match.pov.index]?.weaponId ?? null)
			: null,
		lineups: match.pov
			? {
					pov: lineupOf(match.teams[match.pov.team]),
					opponent: lineupOf(match.teams[match.pov.team === 0 ? 1 : 0]),
				}
			: null,
		deaths: povDeathTimes(sources),
	}));
}

/** Every streak of the scanned VoDs that meets the criteria, best first. */
function candidatesOf(
	folder: MontageFolder | null,
	scanned: MontageSnapshot["scanned"],
	criteria: MontageCriteria,
): MontageCandidate[] {
	const topTeamIds = new Set(
		(folder?.manifest.topTeams ?? []).map((team) => team.id),
	);
	return (folder?.vods ?? [])
		.flatMap((vod) => {
			const teamIds = candidateTeamIds(vod, topTeamIds);
			if (teamIds.length === 0) return [];
			return (scanned.get(vod.file) ?? []).flatMap((game) =>
				montageWindows(game, criteria).map((window) => ({
					key: `${vod.file}@${window.start}-${window.end}`,
					vod,
					window,
					mode: game.mode,
					stage: game.stage,
					weaponId: game.povWeaponId,
					duration: playbackDuration(playbackSegments(window)),
					teamIds,
				})),
			);
		})
		.sort((a, b) => b.window.score - a.window.score);
}

function lineupOf(team: ScannerMatch["teams"][number]) {
	return team.players.map((player) => ({
		name: player.name,
		weaponId: player.weaponId,
	}));
}

/**
 * Picks point at the folder's current manifest entry and candidate: a pick
 * is stored whole, so one made by an older version carries that version's
 * shape (one from before team sections plays under its POV team). Picks of
 * VoDs no longer in the folder or of no top team go.
 */
function currentPicks(
	picks: ReadonlyArray<MontageCandidate & { teamId?: number }>,
): MontagePick[] {
	const vodByFile = new Map(
		(snapshot.folder?.vods ?? []).map((vod) => [vod.file, vod]),
	);
	const topTeamIds = new Set(
		(snapshot.folder?.manifest.topTeams ?? []).map((team) => team.id),
	);
	const candidateByKey = new Map(
		snapshot.candidates.map((candidate) => [candidate.key, candidate]),
	);
	return picks.flatMap((pick) => {
		const vod = vodByFile.get(pick.vod.file);
		const teamId = pick.teamId ?? pick.vod.team?.id;
		if (!vod || teamId === undefined || !topTeamIds.has(teamId)) return [];
		const candidate = candidateByKey.get(pick.key) ?? {
			...pick,
			vod,
			weaponId: pick.weaponId ?? null,
			teamIds: candidateTeamIds(vod, topTeamIds),
		};
		return [{ ...candidate, teamId }];
	});
}

function fileSlug(manifest: MontageManifest): string {
	return manifest.name.replace(/[^\p{L}\p{N}]+/gu, "-");
}

function setPicks(picks: MontagePick[]): void {
	set({ picks });
	persist();
}

/** Writes the montage to the store; a failed write only costs the next reload its restore. */
function persist(): void {
	const folder = snapshot.folder;
	if (!folder) return;
	const montage: StoredMontage = {
		tournamentId: folder.manifest.tournamentId,
		manifest: folder.manifest,
		vods: folder.vods,
		games: Object.fromEntries(snapshot.scanned),
		picks: snapshot.picks,
		music: snapshot.music,
		directory: folder.directory,
		openedAt: Date.now(),
	};
	void putMontage(montage).catch(() => {});
}

function loadCriteria(): MontageCriteria {
	const stored = PersistedState.read(montageCriteriaPersisted);

	return {
		minKills: stored.minKills,
		maxSecondsByKills: {
			...DEFAULT_MONTAGE_CRITERIA.maxSecondsByKills,
			...stored.maxSecondsByKills,
		},
	};
}

/** A writable for a file the user picks; null when the browser has no save dialog (the render then downloads). */
async function openSaveFile(
	suggestedName: string,
): Promise<FileSystemWritableFileStream | null> {
	const picker = (window as Window & { showSaveFilePicker?: SaveFilePicker })
		.showSaveFilePicker;
	if (!picker) return null;
	const handle = await picker({
		suggestedName,
		types: [{ description: "MP4 video", accept: { "video/mp4": [".mp4"] } }],
	});
	return handle.createWritable();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function set(patch: Partial<MontageSnapshot>): void {
	snapshot = { ...snapshot, ...patch };
	if (patch.folder || patch.scanned || patch.criteria) {
		snapshot.candidates = candidatesOf(
			snapshot.folder,
			snapshot.scanned,
			snapshot.criteria,
		);
	}
	for (const listener of listeners) listener();
}
