import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { useShowUnseenDot } from "./notifications-hooks";

const GRACE_MS = 10_000;

function UnseenDot({
	notifications,
}: {
	notifications: Array<{ createdAt: number; seen: number }>;
}) {
	const showDot = useShowUnseenDot(notifications);

	return <div data-testid="dot">{showDot ? "shown" : "hidden"}</div>;
}

const dotStatus = (screen: Awaited<ReturnType<typeof render>>) =>
	screen.getByTestId("dot").element().textContent;

/** Database timestamp (seconds) for a moment relative to the fake clock. */
const createdAt = (offsetMs: number) =>
	Math.floor((Date.now() + offsetMs) / 1000);

/**
 * Runs the fake clock forward and lets React paint what the fired timers
 * changed. React schedules its render through a MessageChannel, which fake
 * timers do not control, so a message of our own posted afterwards is what
 * tells us the render already happened.
 */
const advanceTimers = async (ms: number) => {
	await vi.advanceTimersByTimeAsync(ms);

	return new Promise<void>((resolve) => {
		const channel = new MessageChannel();
		channel.port1.onmessage = () => resolve();
		channel.port2.postMessage(null);
	});
};

describe("useShowUnseenDot", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("shows the dot right away for a notification predating the session", async () => {
		const screen = await render(
			<UnseenDot
				notifications={[{ createdAt: createdAt(-60_000), seen: 0 }]}
			/>,
		);

		expect(dotStatus(screen)).toBe("shown");
	});

	test("never shows the dot when every notification is seen", async () => {
		const screen = await render(
			<UnseenDot
				notifications={[{ createdAt: createdAt(-60_000), seen: 1 }]}
			/>,
		);

		expect(dotStatus(screen)).toBe("hidden");

		await advanceTimers(GRACE_MS * 2);

		expect(dotStatus(screen)).toBe("hidden");
	});

	test("holds the dot back until the grace period passes for one born mid-session", async () => {
		const screen = await render(
			<UnseenDot notifications={[{ createdAt: createdAt(1_000), seen: 0 }]} />,
		);

		expect(dotStatus(screen)).toBe("hidden");

		await advanceTimers(GRACE_MS);

		expect(dotStatus(screen)).toBe("hidden");

		await advanceTimers(2_000);

		expect(dotStatus(screen)).toBe("shown");
	});

	test("shows the dot as soon as the earliest of many notifications is past the grace period", async () => {
		const screen = await render(
			<UnseenDot
				notifications={[
					{ createdAt: createdAt(30_000), seen: 0 },
					{ createdAt: createdAt(1_000), seen: 0 },
				]}
			/>,
		);

		expect(dotStatus(screen)).toBe("hidden");

		await advanceTimers(GRACE_MS + 2_000);

		expect(dotStatus(screen)).toBe("shown");
	});
});
