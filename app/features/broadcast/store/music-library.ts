/**
 * The dashboard's music library, kept in this browser only: the tracks in `music-tracks` in library order, their
 * audio files in `music-files` under their track ids.
 */
import type { BroadcastMusicTrack } from "../broadcast-types";
import type * as ClipTransfer from "../core/ClipTransfer";
import {
	MUSIC_FILES_STORE,
	MUSIC_TRACKS_STORE,
	readwrite,
	request,
} from "./broadcast-db";

interface StoredTrack extends BroadcastMusicTrack {
	position: number;
}

/** The library's tracks in order. */
export async function list(): Promise<BroadcastMusicTrack[]> {
	const stored = await storedTracks();

	return stored
		.toSorted((a, b) => a.position - b.position)
		.map(({ position: _position, ...track }) => track);
}

/** Adds the track to the end of the library, with its file. One already in it stays as it was. */
export async function add({
	track,
	audio,
}: {
	track: BroadcastMusicTrack;
	audio: Blob;
}) {
	const stored = await storedTracks();
	if (stored.some((existing) => existing.id === track.id)) return;
	const position =
		Math.max(-1, ...stored.map((existing) => existing.position)) + 1;

	await readwrite([MUSIC_TRACKS_STORE, MUSIC_FILES_STORE], (transaction) => {
		transaction
			.objectStore(MUSIC_TRACKS_STORE)
			.put({ ...track, position } satisfies StoredTrack);
		transaction.objectStore(MUSIC_FILES_STORE).put(audio, track.id);
	});
}

/** Saves the tracks' details and order, every track of the library given. */
export async function save(tracks: BroadcastMusicTrack[]) {
	await readwrite([MUSIC_TRACKS_STORE], (transaction) => {
		const store = transaction.objectStore(MUSIC_TRACKS_STORE);
		for (const [position, track] of tracks.entries()) {
			store.put({ ...track, position } satisfies StoredTrack);
		}
	});
}

/** Takes the track out of the library, its files with it. */
export async function remove(trackId: string) {
	await readwrite([MUSIC_TRACKS_STORE, MUSIC_FILES_STORE], (transaction) => {
		transaction.objectStore(MUSIC_TRACKS_STORE).delete(trackId);
		transaction.objectStore(MUSIC_FILES_STORE).delete(trackId);
	});
}

/** The tracks' audio files as sent to the overlays. */
export async function files(
	tracks: BroadcastMusicTrack[],
): Promise<ClipTransfer.ClipSource[]> {
	const sources: ClipTransfer.ClipSource[] = [];
	for (const track of tracks) {
		const audio = await request<Blob | undefined>(
			MUSIC_FILES_STORE,
			"readonly",
			(store) => store.get(track.id),
		);
		if (!audio) continue;

		sources.push({
			id: track.id,
			kind: "music",
			load: () => Promise.resolve(audio),
		});
	}

	return sources;
}

function storedTracks() {
	return request<StoredTrack[]>(MUSIC_TRACKS_STORE, "readonly", (store) =>
		store.getAll(),
	);
}
