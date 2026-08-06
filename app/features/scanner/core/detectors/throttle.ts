/**
 * CheckThrottle: caps how often a detector is checked at all (gate included),
 * for detectors that declare a checkIntervalS — screens like the objective
 * counter change at most once a second, so sampling them at the full frame
 * rate buys nothing.
 */

export class CheckThrottle {
	#lastCheckT = new Map<string, number>();

	/**
	 * Whether detector `id` should run its check on the frame at `t` seconds.
	 * Approving a check starts the detector's next interval; a `t` earlier
	 * than the last approved check (a fresh capture session, a VoD rescan)
	 * resets the window instead of blocking until the old timeline catches up.
	 */
	shouldCheck(id: string, t: number, intervalS: number | undefined): boolean {
		if (intervalS === undefined) return true;
		const last = this.#lastCheckT.get(id);
		if (last !== undefined && t >= last && t - last < intervalS) return false;
		this.#lastCheckT.set(id, t);
		return true;
	}
}
