/**
 * FrameReadbackWorker: reads VideoFrames back to RGBA for an analyzer worker
 * (readback.ts), so the readback's wait overlaps the analyzer's detector
 * pass instead of blocking it. A gate-only read leaves the frame on the GPU
 * here until the analyzer asks for it whole or lets it go.
 */
import type * as GateRois from "../core/gate-rois";
import {
	createCanvasReadback,
	createWebGpuReadback,
	type ReadbackRequest,
	type ReadbackResponse,
	readThrough,
} from "./readback";

const readers = {
	canvas: createCanvasReadback(),
	webgpu: createWebGpuReadback(),
};
let spans: GateRois.GateSpans | null = null;

self.onmessage = async (e: MessageEvent<ReadbackRequest>) => {
	const request = e.data;
	if (request.kind === "gates") {
		spans = request.spans;
		return;
	}
	if (request.kind === "release") {
		readers.webgpu.release(request.held);
		return;
	}
	let response: ReadbackResponse;
	try {
		if (request.kind === "whole") {
			const start = performance.now();
			const read = await readers.webgpu.whole(request.held);
			response = {
				id: request.id,
				...read,
				readMs: performance.now() - start,
			};
		} else {
			const { id, frame, path, normalize, gates } = request;
			try {
				response = {
					id,
					...(await readThrough(
						readers,
						frame,
						{ path, normalize },
						gates ? spans : null,
					)),
				};
			} catch (error) {
				frame.close();
				throw error;
			}
		}
	} catch (error) {
		response = { id: request.id, error: String(error) };
	}
	self.postMessage(response, {
		// a 2160p picture's data is its canonical picture: transfer it once
		transfer:
			"data" in response
				? [
						...new Set([
							response.data.buffer,
							...(response.canonical ? [response.canonical.buffer] : []),
							...(response.gray ? [response.gray.buffer] : []),
						]),
					]
				: "gates" in response
					? [response.gates.buffer]
					: [],
	});
};
