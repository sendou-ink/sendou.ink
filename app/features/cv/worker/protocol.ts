import type { DetectedEvent, GateResult } from "../core/detectors/types";

export interface InitRequest {
	kind: "init";
	/**
	 * static assets CDN root the worker fetches icons and atlases from
	 * (`Config.staticAssetsUrl`); passed in the init message so the worker
	 * bundle stays free of the app config graph
	 */
	assetsBaseUrl: string;
	/**
	 * skip parse() for a detector whose gate keeps firing without confidence
	 * improving (static screen); default true — one-shot consumers like the
	 * screenshot harness turn it off
	 */
	suppressSteadyFrames?: boolean;
}

export interface AnalyzeRequest {
	kind: "frame";
	/** VideoFrame is what VoD decode produces; transferring it directly skips
	 * a main-thread ImageBitmap conversion */
	bitmap: ImageBitmap | VideoFrame;
	/** seconds into the stream */
	t: number;
}

export type WorkerResponse =
	| { kind: "ready" }
	| {
			kind: "result";
			detector: string;
			t: number;
			gate: GateResult;
			events: DetectedEvent<unknown>[];
			/** lossless PNG of the exact frame that was analyzed; present when events fired */
			frame?: Blob;
	  }
	/** all detectors have reported for frame t */
	| { kind: "done"; t: number }
	| { kind: "error"; message: string };
