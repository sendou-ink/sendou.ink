import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { SENDOUQ_LOOKING_PAGE } from "~/utils/urls";
import type { GlobalStatus } from "./GlobalStatusProvider";
import { useHasSqGroupExpired } from "./global-status-expiry";

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

function Expiry({ status }: { status: GlobalStatus }) {
	const hasExpired = useHasSqGroupExpired(status);

	return <div data-testid="expiry">{hasExpired ? "expired" : "queued"}</div>;
}

const expiryStatus = (screen: Awaited<ReturnType<typeof render>>) =>
	screen.getByTestId("expiry").element().textContent;

const queuedStatus = (expiresInMs: number): GlobalStatus => ({
	state: "SQ_QUEUED",
	url: SENDOUQ_LOOKING_PAGE,
	expiresAt: Date.now() + expiresInMs,
});

/** Runs the fake clock forward and lets React paint: renders go through a MessageChannel fake timers don't control, so a message of our own posted after signals the render happened. */
const advanceTimers = async (ms: number) => {
	await vi.advanceTimersByTimeAsync(ms);

	return new Promise<void>((resolve) => {
		const channel = new MessageChannel();
		channel.port1.onmessage = () => resolve();
		channel.port2.postMessage(null);
	});
};

describe("useHasSqGroupExpired", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("stays unexpired while the expiry is still ahead", async () => {
		const screen = await render(
			<Expiry status={queuedStatus(THIRTY_MINUTES_MS)} />,
		);
		await advanceTimers(THIRTY_MINUTES_MS - 1000);

		expect(expiryStatus(screen)).toBe("queued");
	});

	test("expires once the expiry passes", async () => {
		const screen = await render(
			<Expiry status={queuedStatus(THIRTY_MINUTES_MS)} />,
		);
		await advanceTimers(THIRTY_MINUTES_MS);

		expect(expiryStatus(screen)).toBe("expired");
	});

	test("expires right away for an expiry already in the past", async () => {
		const screen = await render(<Expiry status={queuedStatus(-1000)} />);
		await advanceTimers(0);

		expect(expiryStatus(screen)).toBe("expired");
	});

	test("never expires a status that is not queued", async () => {
		const screen = await render(
			<Expiry status={{ state: "SQ_MATCH", url: SENDOUQ_LOOKING_PAGE }} />,
		);
		await advanceTimers(THIRTY_MINUTES_MS);

		expect(expiryStatus(screen)).toBe("queued");
	});
});
