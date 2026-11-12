import { createSubscriber } from "svelte/reactivity";

/**
 * The current time, updating whatever reads it at every full minute: the match and round timers' clock, like
 * the React bracket's shared minute timer. One timer runs while anything reads it.
 */
class MinuteTicker {
	#subscribe = createSubscriber((update) => {
		let timeout: ReturnType<typeof setTimeout>;
		const schedule = () => {
			timeout = setTimeout(
				() => {
					update();
					schedule();
				},
				60_000 - (Date.now() % 60_000),
			);
		};
		schedule();

		return () => clearTimeout(timeout);
	});

	get now() {
		this.#subscribe();
		return new Date();
	}
}

export const minuteTicker = new MinuteTicker();
