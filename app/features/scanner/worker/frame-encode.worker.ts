/**
 * FrameEncodeWorker: encodes analyzed frames for an analyzer worker
 * (frame-encode.ts), so the synchronous WebP encode stays off its thread.
 */
import {
	type EncodeRequest,
	type EncodeResponse,
	encodeFrame,
} from "./frame-encode";

self.onmessage = async (e: MessageEvent<EncodeRequest>) => {
	const { id, pixels } = e.data;
	let response: EncodeResponse;
	try {
		response = { id, blob: await encodeFrame(pixels) };
	} catch (error) {
		response = { id, error: String(error) };
	}
	self.postMessage(response);
};
