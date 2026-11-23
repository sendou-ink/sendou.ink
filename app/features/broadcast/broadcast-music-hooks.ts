import * as React from "react";
import { logger } from "~/utils/logger";
import {
	BROADCAST_MUSIC_MAX_FILE_BYTES,
	BROADCAST_MUSIC_MAX_TRACKS,
	BROADCAST_MUSIC_TITLE_MAX_LENGTH,
} from "./broadcast-constants";
import type { BroadcastMusicTrack } from "./broadcast-types";
import * as AudioTags from "./core/AudioTags";
import type * as ClipTransfer from "./core/ClipTransfer";
import * as MusicLibrary from "./store/music-library";

/** Bytes of the content's SHA-256 a track's id is made of. */
const TRACK_ID_BYTES = 16;

/** Why a file didn't make it into the library. */
export type MusicFileProblem = "tooBig" | "unplayable" | "full";

/**
 * The music library of this browser (see `MusicLibrary`), `null` while it loads. Its tracks' files are
 * `files`, as the dashboard sends them to the overlays. Every change resolves with the library's tracks after it.
 */
export function useMusicLibrary() {
	const [tracks, setTracks] = React.useState<BroadcastMusicTrack[] | null>(
		null,
	);
	const [files, setFiles] = React.useState<ClipTransfer.ClipSource[]>([]);

	const reload = React.useCallback(async () => {
		const listed = await MusicLibrary.list();
		setTracks(listed);
		setFiles(await MusicLibrary.files(listed));

		return listed;
	}, []);

	React.useEffect(() => {
		reload().catch((error) =>
			logger.error("Loading the music library failed", error),
		);
	}, [reload]);

	const save = async (changed: BroadcastMusicTrack[]) => {
		setTracks(changed);
		await MusicLibrary.save(changed);

		return changed;
	};

	return {
		tracks,
		files,
		/** Adds the files to the end of the library in order, telling of the ones that couldn't be added. */
		async add(added: File[]) {
			const problems: Array<{ name: string; problem: MusicFileProblem }> = [];
			let count = (await MusicLibrary.list()).length;
			for (const file of added) {
				if (count >= BROADCAST_MUSIC_MAX_TRACKS) {
					problems.push({ name: file.name, problem: "full" });
					continue;
				}

				const read = await readMusicFile(file);
				if ("problem" in read) {
					problems.push({ name: file.name, problem: read.problem });
					continue;
				}

				await MusicLibrary.add(read);
				count++;
			}

			return { tracks: await reload(), problems };
		},
		update(track: BroadcastMusicTrack) {
			return save(
				(tracks ?? []).map((existing) =>
					existing.id === track.id ? track : existing,
				),
			);
		},
		move(trackId: string, toIndex: number) {
			const current = tracks ?? [];
			const moved = current.find((track) => track.id === trackId);
			if (!moved) return Promise.resolve(current);

			const rest = current.filter((track) => track.id !== trackId);

			return save([...rest.slice(0, toIndex), moved, ...rest.slice(toIndex)]);
		},
		async remove(trackId: string) {
			await MusicLibrary.remove(trackId);

			return reload();
		},
	};
}

/** The file as a library track: its id from its contents, details from its tags (the file name as its title without), its length as the browser plays it. */
async function readMusicFile(
	file: File,
): Promise<
	{ track: BroadcastMusicTrack; audio: Blob } | { problem: MusicFileProblem }
> {
	if (file.size > BROADCAST_MUSIC_MAX_FILE_BYTES) return { problem: "tooBig" };

	const durationMs = await playableDurationMs(file);
	if (durationMs === null) return { problem: "unplayable" };

	const bytes = new Uint8Array(await file.arrayBuffer());
	const tags = AudioTags.read(bytes);

	return {
		track: {
			id: await contentId(bytes),
			durationMs,
			title: textOf(tags.title) ?? textOf(withoutExtension(file.name)) ?? "?",
			artist: textOf(tags.artist),
		},
		audio: file,
	};
}

function playableDurationMs(file: File) {
	return new Promise<number | null>((resolve) => {
		const audio = new Audio();
		const url = URL.createObjectURL(file);
		const done = (durationMs: number | null) => {
			URL.revokeObjectURL(url);
			audio.removeAttribute("src");
			resolve(durationMs);
		};

		audio.preload = "metadata";
		audio.onloadedmetadata = () =>
			done(
				Number.isFinite(audio.duration) && audio.duration >= 1
					? Math.round(audio.duration * 1000)
					: null,
			);
		audio.onerror = () => done(null);
		audio.src = url;
	});
}

async function contentId(bytes: Uint8Array<ArrayBuffer>) {
	const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));

	return Array.from(digest.subarray(0, TRACK_ID_BYTES), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function withoutExtension(fileName: string) {
	return fileName.replace(/\.[^.]+$/, "");
}

function textOf(value: string | null) {
	const trimmed = value?.trim().slice(0, BROADCAST_MUSIC_TITLE_MAX_LENGTH);

	return trimmed || null;
}
