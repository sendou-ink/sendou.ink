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
} from "./readback";

const readers = {
	canvas: createCanvasReadback(),
	webgpu: createWebGpuReadback(),
};

self.onmessage = async (e: MessageEvent<ReadbackRequest>) => {
	const { id, frame, path, upscale } = e.data;
	let response: ReadbackResponse;
	try {
		response = {
			id,
			...(path === "webgpu"
				? await readers.webgpu(frame, { upscale })
				: readers.canvas(frame)),
		};
	} catch (error) {
		frame.close();
		response = { id, error: String(error) };
	}
	self.postMessage(response, {
		transfer:
			"data" in response
				? [
						response.data.buffer,
						...(response.canonical ? [response.canonical.buffer] : []),
						...(response.gray ? [response.gray.buffer] : []),
					]
				: [],
	});
};
