/**
 * The dev-only tournament montage's state, one record per tournament, so a
 * reload keeps what took long to get: every scanned VoD's games (reading
 * them back from `vod-events` means building every VoD's matches again),
 * the picks, the music file and the folder's handle to reconnect it with.
 */
import type {
	MontageCandidate,
	MontageGame,
	MontageManifest,
	MontageManifestVod,
} from "../core/montage";
import { MONTAGES_STORE, tx } from "./db";

export interface StoredMontage {
	tournamentId: number;
	manifest: MontageManifest;
	/** the manifest's VoDs the folder had when last opened */
	vods: MontageManifestVod[];
	/** scanned games by VoD file name */
	games: Record<string, MontageGame[]>;
	/** in montage order */
	picks: MontageCandidate[];
	/** plays under the whole video instead of the game sound; absent in records from before it existed */
	music?: File | null;
	/** null when the folder was opened without the File System Access API */
	directory: FileSystemDirectoryHandle | null;
	/** epoch ms; the latest opened montage is restored on load */
	openedAt: number;
}

export async function putMontage(montage: StoredMontage): Promise<void> {
	await tx(MONTAGES_STORE, "readwrite", (store) => store.put(montage));
}

export function loadMontage(
	tournamentId: number,
): Promise<StoredMontage | undefined> {
	return tx(
		MONTAGES_STORE,
		"readonly",
		(store) => store.get(tournamentId) as IDBRequest<StoredMontage | undefined>,
	);
}

/** The montage opened most recently. */
export async function latestMontage(): Promise<StoredMontage | undefined> {
	const montages = await tx(
		MONTAGES_STORE,
		"readonly",
		(store) => store.getAll() as IDBRequest<StoredMontage[]>,
	);
	return montages.toSorted((a, b) => b.openedAt - a.openedAt)[0];
}
