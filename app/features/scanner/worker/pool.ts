/**
 * AnalyzerPool: several AnalyzerClients so frame analysis parallelizes
 * across cores. The VoD scan hands each decoded frame to any idle worker
 * and never waits; when all workers are busy the frame is dropped — the
 * next one is milliseconds of video away, so coverage stays as dense as
 * the machine can analyze. Results arrive out of decode order, which the
 * consumer must tolerate (TimelineBuilder does: it merges on |Δt| and
 * keeps its list sorted, independent of arrival order).
 */
import {
	AnalyzerClient,
	type ErrorHandler,
	type ResultHandler,
} from "./client";

/** leave cores for the main thread and the video decoder */
export function defaultPoolSize(): number {
	return Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 4) - 2));
}

export class AnalyzerPool {
	#clients: AnalyzerClient[];
	#idleWaiters: (() => void)[] = [];

	constructor(size: number, onResult: ResultHandler, onError: ErrorHandler) {
		const wake = () => {
			const waiters = this.#idleWaiters;
			this.#idleWaiters = [];
			for (const waiter of waiters) waiter();
		};
		this.#clients = Array.from(
			{ length: size },
			() =>
				new AnalyzerClient(
					onResult,
					(message) => {
						wake(); // an errored frame is also a finished frame — don't hang whenIdle
						onError(message);
					},
					wake,
				),
		);
	}

	whenReady(): Promise<void> {
		return Promise.all(this.#clients.map((c) => c.whenReady())).then(() => {});
	}

	hasIdle(): boolean {
		return this.#clients.some((c) => !c.busy);
	}

	/** Resolves once at least one worker is free. Call whenReady() first. */
	async whenAnyIdle(): Promise<void> {
		while (!this.hasIdle()) {
			await new Promise<void>((resolve) => this.#idleWaiters.push(resolve));
		}
	}

	/** Hand the frame to an idle worker; false (and the frame closed) when all are busy. */
	tryAnalyze(frame: ImageBitmap | VideoFrame, t: number): boolean {
		const idle = this.#clients.find((c) => !c.busy);
		if (!idle) {
			frame.close();
			return false;
		}
		return idle.analyze(frame, t);
	}

	/** Resolves once no worker has a frame in flight. Call whenReady() first. */
	async whenIdle(): Promise<void> {
		while (this.#clients.some((c) => c.busy)) {
			await new Promise<void>((resolve) => this.#idleWaiters.push(resolve));
		}
	}

	dispose(): void {
		for (const client of this.#clients) client.dispose();
	}
}
