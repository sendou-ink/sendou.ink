/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
/**
 * Builds the battle music set the clip dialog's "Mute music" takes music out
 * with: every audio file of the given folder is copied to
 * SCANNER_ASSETS_DIR/bgm under a stable id, and its fingerprints go into
 * bgm/index.bin (core/music/fingerprint.ts). Titles come from the file
 * names (the text in 「」 when there is one). Keep the source folder outside
 * bgm/: the copies are named by id. Shipping a regen means pushing the
 * assets repo.
 *
 *   pnpm scanner:build-music-index <folder of tracks>
 */
import {
	copyFileSync,
	mkdirSync,
	readdirSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { extname, join } from "node:path";
import {
	encodeMusicIndex,
	type MusicTrack,
	trackHashes,
} from "../../app/features/scanner/core/music/fingerprint";
import { SCANNER_ASSETS_DIR } from "../../app/features/scanner/node/assets-dir";
import { decodeAudioFile } from "../../app/features/scanner/node/audio-io";

const AUDIO_EXTENSIONS = new Set([
	".mp3",
	".m4a",
	".aac",
	".ogg",
	".opus",
	".wav",
	".flac",
]);
const SAMPLE_RATE = 48_000;
const OUT_DIR =
	process.env.SCANNER_MUSIC_OUT_DIR ?? join(SCANNER_ASSETS_DIR, "bgm");

const sourceDir = process.argv[2];
if (!sourceDir) {
	throw new Error("usage: pnpm scanner:build-music-index <folder of tracks>");
}

const files = readdirSync(sourceDir)
	.filter((file) => AUDIO_EXTENSIONS.has(extname(file).toLowerCase()))
	.sort();
if (files.length === 0) throw new Error(`no audio files in ${sourceDir}`);

mkdirSync(OUT_DIR, { recursive: true });
const tracks: MusicTrack[] = [];
const hashes: ReturnType<typeof trackHashes>[] = [];
for (const file of files) {
	const title = trackTitle(file);
	const id = trackId(title);
	if (tracks.some((track) => track.id === id)) {
		throw new Error(`two tracks map to the id "${id}" (${file})`);
	}
	const outFile = `${id}${extname(file).toLowerCase()}`;
	copyFileSync(join(sourceDir, file), join(OUT_DIR, outFile));
	const [mono] = decodeAudioFile(join(sourceDir, file), {
		sampleRate: SAMPLE_RATE,
		channels: 1,
	});
	const trackHashList = trackHashes(mono!, SAMPLE_RATE);
	tracks.push({ id, title, file: outFile });
	hashes.push(trackHashList);
	console.log(`${id}  ${title}  (${trackHashList.length} hashes)`);
}

const indexPath = join(OUT_DIR, "index.bin");
writeFileSync(indexPath, encodeMusicIndex(tracks, hashes));
console.log(
	`wrote ${tracks.length} tracks, index ${(statSync(indexPath).size / 1024).toFixed(0)} KB → ${OUT_DIR}`,
);

function trackTitle(file: string): string {
	const base = file
		.replace(/\.[^.]+$/, "")
		.replace(/^\d+\s*-\s*/, "")
		.trim();
	const quoted = base.match(/「(.+?)」/)?.[1];
	const title =
		quoted ??
		base
			.replace(/【[^】]*】/g, "")
			.replace(/^Splatoon 3\s*[-–]\s*/, "")
			.replace(/\s*-\s*Nintendo Switch$/, "");
	return title
		.replace(/（/g, " (")
		.replace(/）/g, ")")
		.replace(/\s+/g, " ")
		.trim();
}

function trackId(title: string): string {
	const slug = title
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	if (/^[\x20-\x7e]+$/.test(title.normalize("NFKC")) && slug.length >= 3)
		return slug;
	let hash = 0x811c9dc5;
	for (const char of title) {
		hash ^= char.codePointAt(0)!;
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return `track-${hash.toString(16).padStart(8, "0")}`;
}
