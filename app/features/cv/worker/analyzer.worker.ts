/**
 * AnalyzerWorker: owns OpenCV.js (WASM) and the detector registry.
 * The main thread posts ImageBitmaps; results come back as plain JSON.
 */
import { loadOpenCV } from "../core/cv";
import { createAllDetectors } from "../core/detectors/registry";
import { ParseSuppressor } from "../core/detectors/suppressor";
import type { Detector } from "../core/detectors/types";
import { normalizeFrame, toMat } from "../core/image";
import type { AnalyzeRequest, InitRequest, WorkerResponse } from "./protocol";
import { fetchScoreboardResources } from "./resources";

let detectors: Detector<unknown>[] = [];
let suppressor: ParseSuppressor | null = null;

function post(message: WorkerResponse): void {
	self.postMessage(message);
}

async function init({
	assetsBaseUrl,
	suppressSteadyFrames = true,
}: InitRequest): Promise<void> {
	try {
		await loadOpenCV();
		const resources = await fetchScoreboardResources(assetsBaseUrl);
		detectors = createAllDetectors(resources);
		suppressor = suppressSteadyFrames ? new ParseSuppressor() : null;
		post({ kind: "ready" });
	} catch (error) {
		post({ kind: "error", message: `init failed: ${String(error)}` });
	}
}

async function analyze({ bitmap, t }: AnalyzeRequest): Promise<void> {
	const width = "displayWidth" in bitmap ? bitmap.displayWidth : bitmap.width;
	const height =
		"displayHeight" in bitmap ? bitmap.displayHeight : bitmap.height;
	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext("2d")!;
	ctx.drawImage(bitmap, 0, 0);
	bitmap.close();
	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

	const src = toMat({
		width: imageData.width,
		height: imageData.height,
		data: imageData.data,
	});
	let frame: ReturnType<typeof normalizeFrame>;
	try {
		frame = normalizeFrame(src);
	} finally {
		src.delete();
	}

	// On detection, ship back the exact analyzed pixels (lossless, at capture
	// resolution) so the UI never has to re-grab a later frame — encoded at
	// most once per frame, however many detectors fire on it.
	let encoded: Promise<Blob> | null = null;
	const frameBlob = () =>
		(encoded ??= canvas.convertToBlob({ type: "image/png" }));

	try {
		for (const detector of detectors) {
			const gate = detector.gate(frame);
			const runParse = suppressor
				? suppressor.shouldParse(detector.id, gate.pass)
				: gate.pass;
			const events = runParse ? detector.parse(frame, t, gate) : [];
			if (runParse) suppressor?.recordParse(detector.id, events);
			const blob = events.length > 0 ? await frameBlob() : undefined;
			post({
				kind: "result",
				detector: detector.id,
				t,
				gate,
				events,
				frame: blob,
			});
		}
	} catch (error) {
		post({ kind: "error", message: `analyze failed: ${String(error)}` });
	} finally {
		frame.delete();
		post({ kind: "done", t });
	}
}

self.onmessage = (e: MessageEvent) => {
	const msg = e.data as { kind: string } & Record<string, unknown>;
	if (msg.kind === "init") void init(msg as unknown as InitRequest);
	else if (msg.kind === "frame") void analyze(msg as unknown as AnalyzeRequest);
};
