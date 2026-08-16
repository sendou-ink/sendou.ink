import type { ScanTelemetry } from "../core/detectors/telemetry";
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
	 * improving (static screen), and let the scheduler thin out checks;
	 * default true — one-shot consumers like the screenshot harness turn it
	 * off to get every detector on every frame
	 */
	suppressSteadyFrames?: boolean;
	/**
	 * accumulate scan telemetry counters (and time the detectors) so they can
	 * be reported back with progress and done messages; default false — the
	 * VoD tab only asks for them when the telemetry panel is opted into
	 */
	collectTelemetry?: boolean;
}

export interface AnalyzeRequest {
	kind: "frame";
	/** VideoFrame is what VoD decode produces; transferring it directly skips
	 * a main-thread ImageBitmap conversion */
	bitmap: ImageBitmap | VideoFrame;
	/** seconds into the stream */
	t: number;
}

/**
 * Scan a time slice of a VoD entirely inside the worker: demux + decode with
 * mediabunny, schedule detectors, post results as they fire. Decoding in the
 * worker removes the per-frame main-thread hop and lets each worker own a
 * contiguous slice, so scheduler state (cadence, suppression, calm) is exact
 * instead of split across a pool.
 */
export interface ScanChunkRequest {
	kind: "scanChunk";
	file: File;
	chunkIndex: number;
	/** seconds; the chunk scans [tStart, tEnd) */
	tStart: number;
	tEnd: number;
}

export interface AbortChunkRequest {
	kind: "abortChunk";
}

export type WorkerRequest =
	| InitRequest
	| AnalyzeRequest
	| ScanChunkRequest
	| AbortChunkRequest;

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
	/** all due detectors have reported for frame t (per-frame path only) */
	| {
			kind: "done";
			t: number;
			/** scheduler sees dead air — the caller may widen its sampling stride */
			calm: boolean;
			/** null when the worker was not asked to collect telemetry */
			telemetry: ScanTelemetry | null;
	  }
	| {
			kind: "chunkProgress";
			chunkIndex: number;
			/** seconds of video the chunk scan has reached */
			t: number;
			mode: "active" | "skim";
			telemetry: ScanTelemetry | null;
			/** small bitmap of the latest decoded frame, for the preview canvas */
			preview?: ImageBitmap;
	  }
	| { kind: "chunkDone"; chunkIndex: number; telemetry: ScanTelemetry | null }
	| { kind: "error"; message: string };
