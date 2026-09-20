/** Messages between the ring buffer's main-thread client and its worker. */

export interface RingBufferClip {
	blob: Blob;
	/** wall-clock seconds the clip really starts at (the keyframe) */
	start: number;
	end: number;
	hasAudio: boolean;
	thumbnail?: string;
}

export type RingWorkerRequest =
	| {
			kind: "start";
			video: ReadableStream<VideoFrame>;
			audio: ReadableStream<AudioData> | null;
			width: number;
			height: number;
			framerate: number;
			/** how much footage the ring keeps */
			seconds: number;
	  }
	| {
			kind: "cut";
			id: number;
			start: number;
			end: number;
			/** seconds to move the sound later (negative: earlier) against the picture */
			audioOffset: number;
	  };

export type RingWorkerResponse =
	| { kind: "started" }
	/** the encoder could not be set up, or gave up later; no more clips this session */
	| { kind: "error"; message: string }
	| { kind: "cut"; id: number; clip: RingBufferClip | null }
	| { kind: "cutError"; id: number; message: string }
	/** the audio encoder gave up; clips from here on are silent */
	| { kind: "audioError"; message: string }
	/** wall-clock seconds the audio encoder last got a slice with sound in it */
	| { kind: "audioSignal"; at: number };
