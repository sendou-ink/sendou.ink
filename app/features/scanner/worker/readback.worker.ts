/**
 * FrameReadbackWorker: reads VideoFrames back to RGBA for an analyzer worker
 * (readback.ts), so the canvas readback's wait overlaps the analyzer's
 * detector pass instead of blocking it.
 */
import {
	createCanvasReadback,
	type ReadbackRequest,
	type ReadbackResponse,
} from "./readback";

const readFrame = createCanvasReadback();

self.onmessage = (e: MessageEvent<ReadbackRequest>) => {
	const { id, frame } = e.data;
	let response: ReadbackResponse;
	try {
		response = { id, ...readFrame(frame) };
	} catch (error) {
		frame.close();
		response = { id, error: String(error) };
	}
	self.postMessage(response, {
		transfer: "data" in response ? [response.data.buffer] : [],
	});
};
