/**
 * Main-thread wrapper around the AnalyzerWorker: init handshake, one
 * in-flight frame at a time (the sampler drops frames while busy). Each
 * frame yields one result per registered detector, then a single "done".
 */
import { Config } from "../../../config";
import type { WorkerResponse } from "./protocol";

export type ResultHandler = (
	result: Extract<WorkerResponse, { kind: "result" }>,
) => void;
export type ErrorHandler = (message: string) => void;
export type DoneHandler = (t: number) => void;

export class AnalyzerClient {
	#worker: Worker;
	#ready = false;
	#busy = false;
	#onResult: ResultHandler;
	#onError: ErrorHandler;
	#onDone: DoneHandler | undefined;
	#readyPromise: Promise<void>;

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
		this.#readyPromise = new Promise((resolve) => {
			resolveReady = resolve;
		});
		this.#worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
			const msg = e.data;
			if (msg.kind === "ready") {
				this.#ready = true;
				resolveReady();
			} else if (msg.kind === "result") {
				this.#onResult(msg);
			} else if (msg.kind === "done") {
				this.#busy = false;
				this.#onDone?.(msg.t);
			} else if (msg.kind === "error") {
				this.#busy = false;
				this.#onError(msg.message);
			}
		};
		// A throw outside the worker's own try/catch posts neither "error" nor
		// "done"; without these handlers `busy` would stay true forever and the
		// sampler / VoD scan would silently freeze.
		this.#worker.onerror = (e: ErrorEvent) => {
			this.#busy = false;
			this.#onError(`worker error: ${e.message || String(e)}`);
		};
		this.#worker.onmessageerror = () => {
			this.#busy = false;
			this.#onError("worker message deserialization failed");
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

	dispose(): void {
		this.#worker.terminate();
	}
}
