/**
 * Main-thread wrapper around the AnalyzerWorker: init handshake, then either
 * one in-flight frame at a time (live capture / screenshot / seek fallback —
 * each frame yields one result per due detector, then a "done" carrying the
 * scheduler's calm signal and telemetry) or one in-flight chunk scan (the
 * worker decodes and analyzes a VoD time slice by itself, streaming results
 * and progress until "chunkDone").
 */
import { Config } from "../../../config";
import type { ScanTelemetry } from "../core/detectors/telemetry";
import type { WorkerResponse } from "./protocol";

export type ResultHandler = (
	result: Extract<WorkerResponse, { kind: "result" }>,
) => void;
export type ErrorHandler = (message: string) => void;
export interface DoneInfo {
	calm: boolean;
	telemetry: ScanTelemetry;
}
export type DoneHandler = (t: number, info: DoneInfo) => void;
export type ChunkProgress = Extract<WorkerResponse, { kind: "chunkProgress" }>;
export type ChunkProgressHandler = (progress: ChunkProgress) => void;

/** each chunk-scanning worker decodes and analyzes on its own; leave a core
 * for the main thread and one for the browser's media stack */
export function defaultScanWorkerCount(): number {
	return Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 4) - 2));
}

interface PendingChunk {
	resolve(telemetry: ScanTelemetry): void;
	reject(error: Error): void;
	onProgress?: ChunkProgressHandler;
}

export class AnalyzerClient {
	#worker: Worker;
	#ready = false;
	#busy = false;
	#onResult: ResultHandler;
	#onError: ErrorHandler;
	#onDone: DoneHandler | undefined;
	#readyPromise: Promise<void>;
	#rejectReady: ((error: Error) => void) | undefined;
	#idleWaiters: (() => void)[] = [];
	#chunk: PendingChunk | null = null;

	constructor(
		onResult: ResultHandler,
		// biome-ignore lint/suspicious/noConsole: default sink for worker errors when no handler is passed
		onError: ErrorHandler = console.error,
		onDone?: DoneHandler,
		options: { suppressSteadyFrames?: boolean } = {},
	) {
		this.#onResult = onResult;
		this.#onError = onError;
		this.#onDone = onDone;
		this.#worker = new Worker(
			new URL("./analyzer.worker.ts", import.meta.url),
			{
				type: "module",
			},
		);
		let resolveReady!: () => void;
		this.#readyPromise = new Promise((resolve, reject) => {
			resolveReady = resolve;
			this.#rejectReady = reject;
		});
		// init failure also surfaces via onError; don't let an un-awaited
		// whenReady() turn it into an unhandled rejection as well
		this.#readyPromise.catch(() => {});
		this.#worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
			const msg = e.data;
			if (msg.kind === "ready") {
				this.#ready = true;
				resolveReady();
			} else if (msg.kind === "result") {
				this.#onResult(msg);
			} else if (msg.kind === "done") {
				this.#settle();
				this.#onDone?.(msg.t, { calm: msg.calm, telemetry: msg.telemetry });
			} else if (msg.kind === "chunkProgress") {
				this.#chunk?.onProgress?.(msg);
			} else if (msg.kind === "chunkDone") {
				const chunk = this.#chunk;
				this.#chunk = null;
				this.#settle();
				chunk?.resolve(msg.telemetry);
			} else if (msg.kind === "error") {
				this.#fail(msg.message);
			}
		};
		// A throw outside the worker's own try/catch posts neither "error" nor
		// "done"; without these handlers `busy` would stay true forever and the
		// sampler / VoD scan would silently freeze.
		this.#worker.onerror = (e: ErrorEvent) => {
			this.#fail(`worker error: ${e.message || String(e)}`);
		};
		this.#worker.onmessageerror = () => {
			this.#fail("worker message deserialization failed");
		};
		this.#worker.postMessage({
			kind: "init",
			assetsBaseUrl: Config.staticAssetsUrl,
			suppressSteadyFrames: options.suppressSteadyFrames ?? true,
		});
	}

	whenReady(): Promise<void> {
		return this.#readyPromise;
	}

	get busy(): boolean {
		return this.#busy || !this.#ready;
	}

	/** Resolves once no frame or chunk scan is in flight. Call whenReady() first. */
	async whenIdle(): Promise<void> {
		while (this.#busy) {
			await new Promise<void>((resolve) => this.#idleWaiters.push(resolve));
		}
	}

	/** Returns false (and closes the bitmap) if the worker is still busy. */
	analyze(bitmap: ImageBitmap | VideoFrame, t: number): boolean {
		if (this.busy) {
			bitmap.close();
			return false;
		}
		this.#busy = true;
		this.#worker.postMessage({ kind: "frame", bitmap, t }, [bitmap]);
		return true;
	}

	/**
	 * Scan [tStart, tEnd) of `file` inside the worker. Results stream to the
	 * shared result handler; resolves with the chunk's telemetry once done
	 * (an aborted chunk resolves too — abort is not an error).
	 */
	scanChunk(
		request: { file: File; chunkIndex: number; tStart: number; tEnd: number },
		onProgress?: ChunkProgressHandler,
	): Promise<ScanTelemetry> {
		if (this.busy) {
			return Promise.reject(new Error("analyzer is busy"));
		}
		this.#busy = true;
		return new Promise((resolve, reject) => {
			this.#chunk = { resolve, reject, onProgress };
			this.#worker.postMessage({ kind: "scanChunk", ...request });
		});
	}

	/** Ask a running chunk scan to stop; it resolves after the current frame. */
	abortChunk(): void {
		if (this.#chunk) this.#worker.postMessage({ kind: "abortChunk" });
	}

	dispose(): void {
		this.#worker.terminate();
	}

	#settle(): void {
		this.#busy = false;
		const waiters = this.#idleWaiters;
		this.#idleWaiters = [];
		for (const waiter of waiters) waiter();
	}

	#fail(message: string): void {
		// an error before "ready" means init failed — reject whenReady() so
		// callers don't hang on a client that will never become usable
		if (!this.#ready) this.#rejectReady?.(new Error(message));
		const chunk = this.#chunk;
		this.#chunk = null;
		this.#settle();
		if (chunk) chunk.reject(new Error(message));
		else this.#onError(message);
	}
}
