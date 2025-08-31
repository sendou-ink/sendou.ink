/**
 * Internal helper to manage a single pending timeout and expose its pending state.
 */
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

/**
 * Debounces calls to a callback function. Subsequent calls within the delay reset the timer.
 *
 * @template T parameter types for the callback function.
 */
export class DebounceFunction<T extends unknown[]> {
	private target: (...args: T) => void;
	private timeoutManager = new TimeoutManager();
	private time: number;

	/**
	 * Debounces calls to a callback function. Subsequent calls within the delay reset the timer.
	 *
	 * @param target Function to call after the delay.
	 * @param time Delay in milliseconds to wait after the latest call before calling the function (default: 500).
	 *
	 * @example
	 * ```ts
	 * const search = $state('');
	 * const debounce = new DebounceFunction((value) => {
	 *   search.update(value);
	 * }, 1000);
	 *
	 * // Schedule a call to the debounced function
	 * <input type="text" oninput={(e) => debounce.run(e.currentTarget.value)} />
	 *
	 * // Show loading state while a debounced call is pending
	 * {#if debounce.pending()}
	 *   <p>Loading...</p>
	 * {/if}
	 * ```
	 */
	constructor(target: (...args: T) => void, time = 500) {
		this.target = target;
		this.time = time;
	}

	/**
	 * True while a call is pending.
	 */
	get pending() {
		return this.timeoutManager.isPending;
	}

	/**
	 * Schedules a call with the specified arguments.
	 *
	 * @param args Arguments to pass to the function when invoked.
	 */
	run(...args: T) {
		this.timeoutManager.schedule(() => this.target(...args), this.time);
	}

	/**
	 * Cancels any pending calls and immediately invokes the function with the specified arguments.
	 */
	runNow(...args: T) {
		this.timeoutManager.cancel();
		this.target(...args);
	}

	/**
	 * Cancels any pending calls.
	 */
	cancel() {
		this.timeoutManager.cancel();
	}
}

/**
 * Creates a debounced state that copies the value from a source state. Subsequent calls within the delay reset the timer.
 *
 * @template T The debounced states type.
 */
export class DebounceState<T> {
	private target: () => T;
	private current = $state<T>();
	private timeoutManager = new TimeoutManager();
	private time: number;

	/**
	 * Creates a debounced state that copies the value from a source state. Subsequent calls within the delay reset the timer.
	 *
	 * @param target Function that returns the state to use as the source.
	 * @param time Delay in milliseconds to wait after the latest update to the source before copying the value (default: 500).
	 *
	 * @example
	 * ```ts
	 * const search = $state('');
	 * const debounce = new DebounceState(() => search, 1000);
	 *
	 * // The debounced states value updates after the specified delay
	 * <input type="text" bind:value={search} />
	 * <p>You searched: {debounce.value}</p>
	 *
	 * // Show loading state while the debounced state is pending
	 * {#if debounce.pending()}
	 *   <p>Loading...</p>
	 * {/if}
	 * ```
	 */
	constructor(target: () => T, time = 500) {
		this.target = target;
		this.current = target();
		this.time = time;

		$effect(() => {
			void this.target();
			this.run();
		});
	}

	/**
	 * The current value of the debounced state.
	 */
	get value() {
		return this.current!;
	}

	/**
	 * True while the state is pending.
	 */
	get pending() {
		return this.timeoutManager.isPending;
	}

	private run() {
		this.timeoutManager.schedule(() => {
			this.current = this.target();
		}, this.time);
	}

	/**
	 * Cancels any pending updates and immediately copies the current value from the source state.
	 */
	runNow() {
		this.timeoutManager.cancel();
		this.current = this.target();
	}

	/**
	 * Cancels any pending updates and immediately sets the states value.
	 *
	 * @param value The new value to set.
	 */
	setNow(value: T) {
		this.timeoutManager.cancel();
		this.current = value;
	}

	/**
	 * Cancels any pending updates.
	 */
	cancel() {
		this.timeoutManager.cancel();
	}
}
