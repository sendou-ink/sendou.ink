import { subSeconds } from "date-fns";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import QReadyPage from "./q.ready";

vi.mock("../loaders/q.ready.server", () => ({ loader: () => null }));
vi.mock("../actions/q.ready.server", () => ({ action: () => null }));
vi.mock("~/features/auth/core/user", () => ({ useUser: () => ({ id: 1 }) }));
vi.mock("~/features/chat/chat-hooks", () => ({
	useTopicRevalidation: () => {},
}));
vi.mock("~/components/ActionButton", () => ({ ActionButton: () => null }));
vi.mock("../components/GroupLeaver", () => ({ GroupLeaver: () => null }));
vi.mock("../components/GroupCard", () => ({
	GroupCard: () => null,
	HiddenGroupCard: () => null,
}));

const ROUND_TRIP_MS = 50;

afterEach(() => {
	vi.useRealTimers();
});

describe("QReadyPage", () => {
	test("retries an ended countdown the server doesn't consider expired yet every 5 seconds", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

		// the device clock is ahead: the server keeps returning the ready check
		const expiresAt = dateToDatabaseTimestamp(subSeconds(new Date(), 1));
		const loader = vi.fn(async () => {
			await new Promise((resolve) => setTimeout(resolve, ROUND_TRIP_MS));
			return {
				expiresAt,
				group: { id: 1 },
				readyUserIds: [],
				theirGroup: { memberCount: 4, readyCount: 0 },
			};
		});

		const router = createMemoryRouter([
			{ path: "/", element: <QReadyPage />, loader },
		]);
		const initialNavigation = router.navigate("/");
		await vi.advanceTimersByTimeAsync(ROUND_TRIP_MS);
		await initialNavigation;
		const initialCalls = loader.mock.calls.length;

		await render(<RouterProvider router={router} />);

		await vi.advanceTimersByTimeAsync(11_000);

		const revalidations = loader.mock.calls.length - initialCalls;
		expect(revalidations).toBe(3);
	});
});
