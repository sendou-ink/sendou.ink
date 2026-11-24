import type { Page } from "@playwright/test";

/** Records the page's event streams from its next load on, so {@link cutStreams} can drop them. */
export function trackStreams(page: Page) {
	return page.addInitScript(() => {
		const OriginalEventSource = window.EventSource;
		const streams: EventSource[] = [];
		Object.assign(window, { __broadcastStreams: streams });
		window.EventSource = class extends OriginalEventSource {
			constructor(...args: ConstructorParameters<typeof EventSource>) {
				super(...args);
				streams.push(this);
			}
		};
	});
}

/**
 * Drops the page's open event streams like a lost connection does, and keeps the ones to URLs matching `isStream`
 * from connecting again until the returned function is called.
 */
export async function cutStreams(page: Page, isStream: (url: URL) => boolean) {
	await page.route(isStream, (route) => route.abort());
	await page.evaluate(() => {
		const streams = (window as unknown as { __broadcastStreams: EventSource[] })
			.__broadcastStreams;
		for (const stream of streams) {
			if (stream.readyState === EventSource.CLOSED) continue;
			stream.close();
			stream.dispatchEvent(new Event("error"));
		}
	});

	return () => page.unroute(isStream);
}
