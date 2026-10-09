/**
 * FrameReadbackWorker: reads VideoFrames back to RGBA for an analyzer worker
 * (readback.ts), so the readback's wait overlaps the analyzer's detector
 * pass instead of blocking it.
 */
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

self.onmessage = async (e: MessageEvent<ReadbackRequest>) => {
	const { id, frame, path, normalize } = e.data;
	let response: ReadbackResponse;
	try {
		response = {
			id,
			...(await readThrough(readers, frame, { path, normalize })),
		};
	} catch (error) {
		frame.close();
		response = { id, error: String(error) };
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
				: [],
	});
};
