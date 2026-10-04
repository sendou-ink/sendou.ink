/**
 * The tournament montage (dev only, `view=montage`), a module singleton like
 * the VoD scan it drives. Opening a folder written by `pnpm vods:download`
 * (the File System Access API's directory picker) reads its manifest; every
 * VoD in it is scanned in turn through `startVodScan` (saved like any file
 * scan, no clips cut) and its streaks meeting the criteria (`montageWindows`:
 * min splats and a length cap per splat count, kept in localStorage) become
 * candidates. Picking one hides the rest of that team's candidates — a cast
 * has no team, so only its own VoD's go. The scanned games, the picks and
 * the folder's handle live in IndexedDB (`store/montages.ts`): a reload
 * restores the latest montage at once, and the folder reconnects on its own
 * when the browser kept the permission, else with one click. Rendering
 * stitches the picks between the title and standings cards
 * (`capture/montage-render.ts`); the cards and each clip's ribbon are drawn
 * by the page (`MontageGraphics.tsx`), which registers how through
 * `setMontageGraphicCapture`. An optional music file replaces the game
 * sound for the whole video.
 */
import { useSyncExternalStore } from "react";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	type MontageClipSource,
	type MontageRenderProgress,
	renderMontage,
} from "../capture/montage-render";
import { extractVodClip, vodFrameThumbnail } from "../capture/vod-clips";
import { povDeathTimes } from "../core/clips/scoring";
import { buildScannerMatches } from "../core/match-builder";
import {
	DEFAULT_MONTAGE_CRITERIA,
	MONTAGE_MANIFEST_FILE,
	type MontageCandidate,
	type MontageCriteria,
	type MontageGame,
	type MontageManifest,
	type MontageManifestVod,
	montageWindows,
	playbackDuration,
	playbackSegments,
} from "../core/montage";
import type { ScannerMatch } from "../core/scanner-match";
import {
	latestMontage,
	loadMontage,
	putMontage,
	type StoredMontage,
} from "../store/montages";
import { listVods, loadVod, loadVodEvents } from "../store/vods";
import { downloadBlob } from "./download";
import { describeError } from "./errors";
import { scannedTeamComps } from "./montage-comps";
import { cancelVodScan, startVodScan } from "./vod-scan";

const CRITERIA_STORAGE_KEY = "scanner:montage-criteria";

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
	| { kind: "title" }
	| { kind: "standings" }
	/** the results image on its own: every top team's roster and comp */
	| { kind: "results" }
	| {
			kind: "ribbon";
			vod: MontageManifestVod;
			weaponId: MainWeaponId | null;
	  };

/** resolves to the graphic as a PNG */
type GraphicCapture = (graphic: MontageGraphic) => Promise<Blob>;

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
	/** in montage order */
	picks: MontageCandidate[];
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

/** Candidates still pickable: none from a team (or a cast VoD) already picked. */
export function availableCandidates(state: MontageSnapshot) {
	const pickedTeams = new Set(
		state.picks.map((candidate) => teamKey(candidate.vod)),
	);
	return state.candidates.filter(
		(candidate) => !pickedTeams.has(teamKey(candidate.vod)),
	);
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
	try {
		localStorage.setItem(CRITERIA_STORAGE_KEY, JSON.stringify(criteria));
	} catch {
		// private mode or a full quota: the criteria still hold for this visit
	}
}

/** Sets or clears the music that replaces the game sound. */
export function setMontageMusic(music: File | null): void {
	set({ music });
	persist();
}

export function pickCandidate(candidate: MontageCandidate): void {
	setPicks([...snapshot.picks, candidate]);
}

export function unpickCandidate(key: string): void {
	setPicks(snapshot.picks.filter((pick) => pick.key !== key));
}

/** Moves a pick `delta` places, clamped to the list. */
export function movePick(key: string, delta: number): void {
	const index = snapshot.picks.findIndex((pick) => pick.key === key);
	if (index === -1) return;
	const picks = snapshot.picks.toSpliced(index, 1);
	picks.splice(
		Math.max(0, Math.min(picks.length, index + delta)),
		0,
		snapshot.picks[index]!,
	);
	setPicks(picks);
}

/** A small JPEG data URL of the candidate's last kill; decoded once, one at a time. */
export function candidateThumbnail(
	candidate: MontageCandidate,
): Promise<string | null> {
	const file = snapshot.folder?.files?.get(candidate.vod.file);
	if (!file) return Promise.resolve(null);
	let thumbnail = thumbnails.get(candidate.key);
	if (!thumbnail) {
		thumbnail = thumbnailQueue.then(() =>
			vodFrameThumbnail(file, candidate.window.t),
		);
		thumbnailQueue = thumbnail;
		thumbnails.set(candidate.key, thumbnail);
	}
	return thumbnail;
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
 * Renders the picks into an MP4, saved where the user picks (Chrome's save
 * dialog, opened first so the click still counts as the user's gesture) or,
 * without one, downloaded once done.
 */
export async function renderMontageVideo(): Promise<void> {
	const folder = snapshot.folder;
	const files = folder?.files;
	const picks = snapshot.picks;
	if (
		!folder ||
		!files ||
		picks.length === 0 ||
		snapshot.render?.state === "rendering"
	) {
		return;
	}
	const { manifest } = folder;
	const fileName = `${fileSlug(manifest)}-montage.mp4`;

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
		render: {
			state: "rendering",
			done: 0,
			total: montageDuration(picks),
		},
	});
	try {
		const captureBlob = captureGraphic;
		if (!captureBlob) throw new Error("the montage view isn't mounted");
		const capture = async (graphic: MontageGraphic) =>
			createImageBitmap(await captureBlob(graphic));
		const title = await capture({ kind: "title" });
		const standings = await capture({ kind: "standings" });
		const clips: MontageClipSource[] = [];
		for (const candidate of picks) {
			const file = files.get(candidate.vod.file);
			if (!file) {
				throw new Error(`${candidate.vod.file} is not in the folder`);
			}
			clips.push({
				file,
				segments: playbackSegments(candidate.window),
				ribbon: await capture({
					kind: "ribbon",
					vod: candidate.vod,
					weaponId: candidate.weaponId,
				}),
			});
		}
		const blob = await renderMontage({
			title,
			clips,
			standings,
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

/** Downloads the results image (every top team's roster and comp) as a PNG. */
export async function downloadMontageResults(): Promise<void> {
	const folder = snapshot.folder;
	if (!folder?.files) throw new Error("reconnect the folder first");
	if (!captureGraphic) throw new Error("the montage view isn't mounted");
	downloadBlob(
		`${fileSlug(folder.manifest)}-results.png`,
		await captureGraphic({ kind: "results" }),
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

/** Seconds of montage the clips make, fast-forwarded (cards excluded). */
export function montageDuration(candidates: readonly MontageCandidate[]) {
	return candidates.reduce((sum, candidate) => sum + candidate.duration, 0);
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
	if (manifest.vods.some((vod) => !vod.teams)) {
		throw new Error(
			`${MONTAGE_MANIFEST_FILE} is from an older version: run pnpm vods:download ${manifest.tournamentId} again`,
		);
	}
	const names = new Set(
		[
			manifest.logo,
			manifest.organization?.logo ?? null,
			...manifest.topTeams.map((team) => team.logo),
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
	return (folder?.vods ?? [])
		.flatMap((vod) =>
			(scanned.get(vod.file) ?? []).flatMap((game) =>
				montageWindows(game, criteria).map((window) => ({
					key: `${vod.file}@${window.start}-${window.end}`,
					vod,
					window,
					mode: game.mode,
					stage: game.stage,
					weaponId: game.povWeaponId,
					duration: playbackDuration(playbackSegments(window)),
				})),
			),
		)
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
 * shape. Picks of VoDs no longer in the folder go.
 */
function currentPicks(picks: readonly MontageCandidate[]): MontageCandidate[] {
	const vodByFile = new Map(
		(snapshot.folder?.vods ?? []).map((vod) => [vod.file, vod]),
	);
	const candidateByKey = new Map(
		snapshot.candidates.map((candidate) => [candidate.key, candidate]),
	);
	return picks.flatMap((pick) => {
		const vod = vodByFile.get(pick.vod.file);
		if (!vod) return [];
		return [
			candidateByKey.get(pick.key) ?? {
				...pick,
				vod,
				weaponId: pick.weaponId ?? null,
			},
		];
	});
}

function fileSlug(manifest: MontageManifest): string {
	return manifest.name.replace(/[^\p{L}\p{N}]+/gu, "-");
}

function teamKey(vod: MontageManifestVod): string {
	return vod.team ? `team:${vod.team.id}` : `vod:${vod.file}`;
}

function setPicks(picks: MontageCandidate[]): void {
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
	try {
		const stored: Partial<MontageCriteria> = JSON.parse(
			localStorage.getItem(CRITERIA_STORAGE_KEY) ?? "{}",
		);
		return {
			minKills: stored.minKills ?? DEFAULT_MONTAGE_CRITERIA.minKills,
			maxSecondsByKills: {
				...DEFAULT_MONTAGE_CRITERIA.maxSecondsByKills,
				...stored.maxSecondsByKills,
			},
		};
	} catch {
		return DEFAULT_MONTAGE_CRITERIA;
	}
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
