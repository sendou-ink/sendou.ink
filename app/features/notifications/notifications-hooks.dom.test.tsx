import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { advanceTimersByTimeAsync } from "~/utils/test-helpers";
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

const dotStatus = () => screen.getByTestId("dot").textContent;

/** Database timestamp (seconds) for a moment relative to the fake clock. */
const createdAt = (offsetMs: number) =>
	dateToDatabaseTimestamp(new Date(Date.now() + offsetMs));

const advanceTimers = (ms: number) => act(() => advanceTimersByTimeAsync(ms));

describe("useShowUnseenDot", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("shows the dot right away for a notification predating the session", async () => {
		render(
			<UnseenDot
				notifications={[{ createdAt: createdAt(-60_000), seen: 0 }]}
			/>,
		);

		expect(dotStatus()).toBe("shown");
	});

	test("never shows the dot when every notification is seen", async () => {
		render(
			<UnseenDot
				notifications={[{ createdAt: createdAt(-60_000), seen: 1 }]}
			/>,
		);

		expect(dotStatus()).toBe("hidden");

		await advanceTimers(GRACE_MS * 2);

		expect(dotStatus()).toBe("hidden");
	});

	test("holds the dot back until the grace period passes for one born mid-session", async () => {
		render(
			<UnseenDot notifications={[{ createdAt: createdAt(1_000), seen: 0 }]} />,
		);

		expect(dotStatus()).toBe("hidden");

		await advanceTimers(GRACE_MS);

		expect(dotStatus()).toBe("hidden");

		await advanceTimers(2_000);

		expect(dotStatus()).toBe("shown");
	});

	test("shows the dot as soon as the earliest of many notifications is past the grace period", async () => {
		render(
			<UnseenDot
				notifications={[
					{ createdAt: createdAt(30_000), seen: 0 },
					{ createdAt: createdAt(1_000), seen: 0 },
				]}
			/>,
		);

		expect(dotStatus()).toBe("hidden");

		await advanceTimers(GRACE_MS + 2_000);

		expect(dotStatus()).toBe("shown");
	});
});
