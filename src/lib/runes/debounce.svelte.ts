class TimeoutManager {
	private timeoutId!: ReturnType<typeof setTimeout>;
	private pending = $state<boolean>()!;

	get isPending() {
		return this.pending;
	}

	schedule(callback: () => void, delay: number) {
		this.cancel();
		this.pending = true;

		this.timeoutId = setTimeout(() => {
			callback();
			this.pending = false;
		}, delay);
	}

	cancel() {
		clearTimeout(this.timeoutId);
		this.pending = false;
	}
}

export class DebounceFunction<T extends unknown[]> {
	private target: (...args: T) => void;
	private timeoutManager = new TimeoutManager();
	private time: number;

	constructor(target: (...args: T) => void, time = 300) {
		this.target = target;
		this.time = time;
	}

	get pending() {
		return this.timeoutManager.isPending;
	}

	run(...args: T) {
		this.timeoutManager.schedule(() => this.target(...args), this.time);
	}

	runNow(...args: T) {
		this.timeoutManager.cancel();
		this.target(...args);
	}

	cancel() {
		this.timeoutManager.cancel();
	}
}

export class DebounceState<T> {
	private target: () => T;
	private current = $state<T>();
	private timeoutManager = new TimeoutManager();
	private time: number;

	constructor(target: () => T, time = 300) {
		this.target = target;
		this.current = target();
		this.time = time;

		$effect(() => {
			void this.target();
			this.run();
		});
	}

	get value() {
		return this.current!;
	}

	get pending() {
		return this.timeoutManager.isPending;
	}

	private run() {
		this.timeoutManager.schedule(() => {
			this.current = this.target();
		}, this.time);
	}

	runNow() {
		this.timeoutManager.cancel();
		this.current = this.target();
	}

	setNow(value: T) {
		this.timeoutManager.cancel();
		this.current = value;
	}

	cancel() {
		this.timeoutManager.cancel();
	}
}
