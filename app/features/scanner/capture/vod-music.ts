/**
 * A whole VoD again with the battle music taken out (vod-music.worker.ts
 * does the work): first the music is searched for, then, when the user
 * asks to save, the video is written to a file they pick. Browsers with no
 * save dialog get it written to the origin private file system and
 * downloaded from there; those copies are deleted on a later visit, once
 * the download surely finished.
 */
import { Config } from "~/config";
import { downloadBlob } from "~/utils/download";
import type { VodMusicRequest, VodMusicResponse } from "./vod-music-protocol";

const OPFS_PREFIX = "vod-no-music-";
const OPFS_KEEP_MS = 60 * 60 * 1000;

export type VodMusicState =
	| { status: "finding"; fraction: number }
	| { status: "found"; seconds: number; titles: string[] }
	| { status: "no-music" }
	| { status: "writing"; fraction: number }
	| { status: "saved" }
	| { status: "error"; message: string };

type SaveFilePicker = (options: {
	suggestedName: string;
	types: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<FileSystemFileHandle>;

/** Starts searching `file` for music; `save` (from a click, it may open a save dialog) writes the result. */
export function startVodMusicRemoval(
	file: File,
	onChange: (state: VodMusicState) => void,
): { save: () => Promise<void>; cancel: () => void } {
	const worker = new Worker(new URL("./vod-music.worker.ts", import.meta.url), {
		type: "module",
	});
	const outputName = noMusicName(file.name);
	const opfsName = `${OPFS_PREFIX}${Date.now()}-${outputName}`;
	let phase: "finding" | "writing" = "finding";
	let isInOpfs = false;
	let isOver = false;
	const end = () => {
		isOver = true;
		worker.terminate();
	};

	const fail = (message: string) => {
		end();
		if (isInOpfs) void deleteOpfsFile(opfsName);
		onChange({ status: "error", message });
	};
	worker.onmessage = async (event: MessageEvent<VodMusicResponse>) => {
		const response = event.data;
		if (response.kind === "progress") {
			onChange({ status: phase, fraction: Math.min(1, response.fraction) });
		} else if (response.kind === "found") {
			onChange({ status: "found", ...response });
		} else if (response.kind === "no-music") {
			end();
			onChange({ status: "no-music" });
		} else if (response.kind === "written") {
			end();
			if (isInOpfs) {
				const root = await navigator.storage.getDirectory();
				const handle = await root.getFileHandle(opfsName);
				downloadBlob(outputName, await handle.getFile());
			}
			onChange({ status: "saved" });
		} else {
			fail(response.message);
		}
	};
	worker.onerror = (event) => fail(event.message);
	onChange({ status: "finding", fraction: 0 });
	worker.postMessage({
		kind: "find",
		file,
		assetsBaseUrl: Config.staticAssetsUrl,
	} satisfies VodMusicRequest);

	return {
		async save() {
			let handle: FileSystemFileHandle | null;
			try {
				handle = await pickSaveFile(outputName);
			} catch {
				// the save dialog was closed
				return;
			}
			isInOpfs = handle === null;
			phase = "writing";
			onChange({ status: "writing", fraction: 0 });
			worker.postMessage({
				kind: "write",
				handle,
				opfsName,
			} satisfies VodMusicRequest);
		},
		/** stops the work; a finished video is left alone */
		cancel() {
			if (isOver) return;
			end();
			if (isInOpfs) void deleteOpfsFile(opfsName);
		},
	};
}

/** Deletes the music-free videos written for downloading over an hour ago. */
export async function deleteStaleVodMusicFiles(): Promise<void> {
	if (!navigator.storage?.getDirectory) return;
	const root = await navigator.storage.getDirectory();
	const entries = (
		root as FileSystemDirectoryHandle & {
			entries(): AsyncIterable<[string, FileSystemHandle]>;
		}
	).entries();
	for await (const [name, handle] of entries) {
		if (!name.startsWith(OPFS_PREFIX) || handle.kind !== "file") continue;
		const file = await (handle as FileSystemFileHandle).getFile();
		if (Date.now() - file.lastModified > OPFS_KEEP_MS) {
			await root.removeEntry(name).catch(() => {});
		}
	}
}

/** `match.mkv` → `match-no-music.mkv`; anything not Matroska is written as MP4. */
function noMusicName(name: string): string {
	const stem = name.replace(/\.[^.]+$/, "");
	const extension = /\.(mkv|webm)$/i.test(name) ? ".mkv" : ".mp4";
	return `${stem}-no-music${extension}`;
}

/** A file the user picks; null when the browser has no save dialog. */
async function pickSaveFile(
	suggestedName: string,
): Promise<FileSystemFileHandle | null> {
	const picker = (window as Window & { showSaveFilePicker?: SaveFilePicker })
		.showSaveFilePicker;
	if (!picker) return null;
	const isMatroska = suggestedName.endsWith(".mkv");
	return picker({
		suggestedName,
		types: [
			isMatroska
				? {
						description: "Matroska video",
						accept: { "video/x-matroska": [".mkv"] },
					}
				: { description: "MP4 video", accept: { "video/mp4": [".mp4"] } },
		],
	});
}

async function deleteOpfsFile(name: string) {
	const root = await navigator.storage.getDirectory();
	await root.removeEntry(name).catch(() => {});
}
