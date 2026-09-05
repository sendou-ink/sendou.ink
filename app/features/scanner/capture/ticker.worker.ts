/**
 * Interval clock for the frame sampler, in a worker because worker timers keep
 * firing while the tab is hidden (unlike rAF / requestVideoFrameCallback /
 * throttled setInterval). Receives the interval in ms, then posts ticks forever.
 */
self.onmessage = (e: MessageEvent<number>) => {
	setInterval(() => self.postMessage(0), e.data);
};
