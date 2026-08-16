/**
 * Interval clock for the frame sampler. Lives in a worker because worker
 * timers keep firing while the tab is hidden, unlike main-thread rAF /
 * requestVideoFrameCallback / throttled setInterval. Receives the interval
 * in ms, then posts a tick forever.
 */
self.onmessage = (e: MessageEvent<number>) => {
	setInterval(() => self.postMessage(0), e.data);
};
