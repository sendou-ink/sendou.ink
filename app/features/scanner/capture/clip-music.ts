/**
 * Muting a clip's battle music: the clip comes back with its sound minus the
 * music (core/music/music-removal.ts), the other game sounds kept. The work
 * runs in clip-music.worker.ts, one worker per clip.
 */
import { Config } from "~/config";
import type {
	ClipMusicRequest,
	ClipMusicResponse,
} from "./clip-music-protocol";

export function muteClipMusic(
	clip: Blob,
): Promise<Exclude<ClipMusicResponse, { kind: "error" }>> {
	const worker = new Worker(
		new URL("./clip-music.worker.ts", import.meta.url),
		{
			type: "module",
		},
	);
	return new Promise<Exclude<ClipMusicResponse, { kind: "error" }>>(
		(resolve, reject) => {
			worker.onmessage = (event: MessageEvent<ClipMusicResponse>) => {
				const response = event.data;
				if (response.kind === "error") reject(new Error(response.message));
				else resolve(response);
			};
			worker.onerror = (event) => reject(new Error(event.message));
			worker.postMessage({
				clip,
				assetsBaseUrl: Config.staticAssetsUrl,
			} satisfies ClipMusicRequest);
		},
	).finally(() => worker.terminate());
}
