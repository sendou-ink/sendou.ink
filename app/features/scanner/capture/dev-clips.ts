/**
 * Dev-only stand-ins for captured clips: short, playable MP4s of an animated
 * card with random kills, mode and stage, saved through the real clip store so
 * the clip views can be worked on without playing a game. Used by the dev
 * toolbar's Triggers app.
 */
import {
	AudioBufferSource,
	BufferTarget,
	CanvasSource,
	getFirstEncodableAudioCodec,
	getFirstEncodableVideoCodec,
	Mp4OutputFormat,
	Output,
	Quality,
} from "mediabunny";
import * as R from "remeda";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import { refreshClips } from "../components/clips-feed";
import { clipTitle, modeLabel, stageLabel } from "../core/labels";
import {
	type ClipToSave,
	rollSessionClipsIntoHistory,
	saveClip,
} from "../store/clips";

const WIDTH = 640;
const HEIGHT = 360;
const FPS = 30;
const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 180;
const AUDIO_SAMPLE_RATE = 48_000;
const HUES = [210, 270, 330, 20, 50, 140, 180];
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Saves `count` random clips into the clip history the way ending a live
 * session does, so the history cap evicts the lowest-scoring ones (rolling a
 * running session's clips in along with them). Resolves to how many were saved.
 */
export async function addRandomHistoryClips(count: number): Promise<number> {
	const sessionKey = Date.now();
	let saved = 0;
	for (let i = 0; i < count; i++) {
		const { clip, blob } = await randomClip(sessionKey);
		if (await saveClip(clip, blob)) saved++;
	}
	await rollSessionClipsIntoHistory();
	await refreshClips();
	return saved;
}

async function randomClip(
	sessionKey: number,
): Promise<{ clip: ClipToSave; blob: Blob }> {
	const kills = R.randomInteger(3, 8);
	const seconds = R.randomInteger(4, 8);
	const start = R.randomInteger(30, 600);
	const end = start + seconds;
	const mode = R.sample(rankedModesShort, 1)[0]!;
	const stage = R.sample(stageIds, 1)[0]!;
	const hue = R.sample(HUES, 1)[0]!;
	const caption = [
		clipTitle({ kills }),
		modeLabel(mode),
		stageLabel(stage),
	].join(" · ");
	const { blob, thumbnail, hasAudio } = await renderVideo({
		seconds,
		hue,
		caption,
	});

	return {
		clip: {
			createdAt: Date.now() - R.randomInteger(0, 7 * DAY_MS),
			bucket: "session",
			source: { kind: "live", sessionKey },
			start,
			end,
			t: end - 1,
			time: R.randomInteger(0, 300),
			score: kills * 4 + R.randomInteger(0, 10),
			kills,
			mode,
			stage,
			hasAudio,
			thumbnail,
		},
		blob,
	};
}

async function renderVideo({
	seconds,
	hue,
	caption,
}: {
	seconds: number;
	hue: number;
	caption: string;
}): Promise<{ blob: Blob; thumbnail: string; hasAudio: boolean }> {
	const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
	const ctx = canvas.getContext("2d")!;
	const videoCodec = await getFirstEncodableVideoCodec(["avc", "vp9", "av1"], {
		width: WIDTH,
		height: HEIGHT,
	});
	if (!videoCodec) throw new Error("this browser can't encode video");
	const audioCodec = await getFirstEncodableAudioCodec(["aac", "opus"], {
		numberOfChannels: 1,
		sampleRate: AUDIO_SAMPLE_RATE,
	});

	const format = new Mp4OutputFormat({ fastStart: "in-memory" });
	const target = new BufferTarget();
	const output = new Output({ format, target });
	const videoSource = new CanvasSource(canvas, {
		codec: videoCodec,
		quality: new Quality("medium"),
	});
	output.addVideoTrack(videoSource, { frameRate: FPS });
	const audioSource = audioCodec
		? new AudioBufferSource({ codec: audioCodec, quality: new Quality("low") })
		: null;
	if (audioSource) output.addAudioTrack(audioSource);

	await output.start();
	if (audioSource) {
		await audioSource.add(
			new AudioBuffer({
				length: seconds * AUDIO_SAMPLE_RATE,
				numberOfChannels: 1,
				sampleRate: AUDIO_SAMPLE_RATE,
			}),
		);
	}
	let thumbnail = "";
	const frameCount = seconds * FPS;
	for (let frame = 0; frame < frameCount; frame++) {
		drawFrame(ctx, { progress: frame / frameCount, hue, caption });
		if (frame === 0) thumbnail = await thumbnailOf(canvas);
		await videoSource.add(frame / FPS, 1 / FPS);
	}
	await output.finalize();

	return {
		blob: new Blob([target.buffer!], { type: format.mimeType }),
		thumbnail,
		hasAudio: audioSource !== null,
	};
}

function drawFrame(
	ctx: OffscreenCanvasRenderingContext2D,
	{
		progress,
		hue,
		caption,
	}: { progress: number; hue: number; caption: string },
) {
	const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
	gradient.addColorStop(0, `hsl(${hue} 80% 55%)`);
	gradient.addColorStop(1, `hsl(${hue + 60} 80% 40%)`);
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, WIDTH, HEIGHT);

	ctx.fillStyle = "rgb(255 255 255 / 0.85)";
	ctx.beginPath();
	ctx.arc(40 + progress * (WIDTH - 80), HEIGHT * 0.62, 18, 0, Math.PI * 2);
	ctx.fill();

	ctx.fillStyle = "white";
	ctx.textAlign = "center";
	ctx.font = "bold 28px sans-serif";
	ctx.fillText("Dev clip", WIDTH / 2, HEIGHT * 0.18);
	ctx.font = "20px sans-serif";
	ctx.fillText(caption, WIDTH / 2, HEIGHT * 0.28);
}

async function thumbnailOf(canvas: OffscreenCanvas): Promise<string> {
	const small = new OffscreenCanvas(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
	small
		.getContext("2d")!
		.drawImage(canvas, 0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
	const blob = await small.convertToBlob({ type: "image/jpeg", quality: 0.7 });
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}
