import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import { advanceTimersByTimeAsync } from "~/utils/test-helpers";
import { SENDOUQ_LOOKING_PAGE } from "~/utils/urls";
import { useHasSqGroupExpired } from "./global-status-expiry";
import type { GlobalStatus } from "./global-status-types";

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

function Expiry({ status }: { status: GlobalStatus }) {
	const hasExpired = useHasSqGroupExpired(status);

	return <div data-testid="expiry">{hasExpired ? "expired" : "queued"}</div>;
}

const expiryStatus = () => screen.getByTestId("expiry").textContent;

const queuedStatus = (expiresInMs: number): GlobalStatus => ({
	state: "SQ_QUEUED",
	url: SENDOUQ_LOOKING_PAGE,
	expiresAt: Date.now() + expiresInMs,
});

const advanceTimers = (ms: number) => act(() => advanceTimersByTimeAsync(ms));

describe("useHasSqGroupExpired", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("stays unexpired while the expiry is still ahead", async () => {
		render(<Expiry status={queuedStatus(THIRTY_MINUTES_MS)} />);
		await advanceTimers(THIRTY_MINUTES_MS - 1000);

		expect(expiryStatus()).toBe("queued");
	});

	test("expires once the expiry passes", async () => {
		render(<Expiry status={queuedStatus(THIRTY_MINUTES_MS)} />);
		await advanceTimers(THIRTY_MINUTES_MS);

		expect(expiryStatus()).toBe("expired");
	});

	test("expires right away for an expiry already in the past", async () => {
		render(<Expiry status={queuedStatus(-1000)} />);
		await advanceTimers(0);

		expect(expiryStatus()).toBe("expired");
	});

	test("never expires a status that is not queued", async () => {
		render(
			<Expiry status={{ state: "SQ_MATCH", url: SENDOUQ_LOOKING_PAGE }} />,
		);
		await advanceTimers(THIRTY_MINUTES_MS);

		expect(expiryStatus()).toBe("queued");
	});
});
