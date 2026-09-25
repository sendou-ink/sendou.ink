/**
 * VodDecodeWorker: dense sequential decode of a VoD slice for an analyzer
 * worker (frame-source.ts), so demux and decode bookkeeping stay off the
 * analyzer's thread. Samples before the analyzer's floor are closed here and
 * sent as bare timestamps; frames from the floor on are transferred, at most
 * MAX_OPEN_FRAMES at a time.
 */
import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";
import {
	type DecodeRequest,
	type DecodeResponse,
	pumpSamples,
	type SourceItem,
} from "./frame-source";

interface Session {
	id: number;
	floor: number;
	open: number;
	stopped: boolean;
	room: (() => void) | null;
}

let session: Session | null = null;

self.postMessage({ kind: "ready" } satisfies DecodeResponse);

self.onmessage = (e: MessageEvent<DecodeRequest>) => {
	const request = e.data;
	if (request.kind === "open") {
		void decode(request);
		return;
	}
	if (!session || session.id !== request.session) return;
	if (request.kind === "floor") {
		session.floor = Math.max(session.floor, request.t);
	} else if (request.kind === "release") {
		session.open--;
		wakeRoom(session);
	} else {
		session.stopped = true;
		wakeRoom(session);
		// the last message of the session: the analyzer stops listening
		self.postMessage({
			kind: "error",
			session: session.id,
			message: "closed",
		} satisfies DecodeResponse);
	}
};

async function decode(
	request: Extract<DecodeRequest, { kind: "open" }>,
): Promise<void> {
	if (session) {
		session.stopped = true;
		wakeRoom(session);
	}
	const own: Session = {
		id: request.session,
		floor: Number.NEGATIVE_INFINITY,
		open: 0,
		stopped: false,
		room: null,
	};
	session = own;
	const post = (response: DecodeResponse, items: SourceItem[] = []) =>
		self.postMessage(response, {
			transfer: items.flatMap((item) => [
				...(item.frame ? [item.frame] : []),
				...(item.preview ? [item.preview] : []),
			]),
		});
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(request.file),
	});
	try {
		const track = await input.getPrimaryVideoTrack();
		if (!track) throw new Error("no video track");
		await pumpSamples({
			samples: new VideoSampleSink(track).samples(request.start),
			end: request.end,
			preview: request.preview,
			floor: () => own.floor,
			open: () => own.open,
			stopped: () => own.stopped,
			waitForRoom: () =>
				new Promise<void>((resolve) => {
					own.room = resolve;
				}),
			deliver: (items, end) => {
				if (own.stopped) {
					for (const item of items) {
						item.frame?.close();
						item.preview?.close();
					}
					return;
				}
				for (const item of items) if (item.frame) own.open++;
				post({ kind: "items", session: own.id, items, end }, items);
			},
		});
	} catch (error) {
		if (!own.stopped) {
			post({ kind: "error", session: own.id, message: String(error) });
		}
	} finally {
		input.dispose();
		if (session === own) session = null;
	}
}

function wakeRoom(target: Session): void {
	target.room?.();
	target.room = null;
}
