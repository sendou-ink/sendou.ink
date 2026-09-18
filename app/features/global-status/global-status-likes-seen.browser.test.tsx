import { afterEach, describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { SENDOUQ_LOOKING_PAGE } from "~/utils/urls";
import {
	useHasUnseenSqLikes,
	useMarkSqLikesSeen,
} from "./global-status-likes-seen";
import type { GlobalStatus } from "./global-status-types";

const SEEN_SQ_LIKES_KEY = "seen-sq-likes";
const GROUP_ID = 1;

function UnseenLikes({ status }: { status: GlobalStatus | null }) {
	const hasUnseen = useHasUnseenSqLikes(status);

	return <div data-testid="unseen">{hasUnseen ? "unseen" : "seen"}</div>;
}

function MarkSeen({
	groupId,
	receivedLikesCount,
}: {
	groupId: number | undefined;
	receivedLikesCount: number;
}) {
	useMarkSqLikesSeen(groupId, receivedLikesCount);

	return null;
}

const unseenStatus = (screen: Awaited<ReturnType<typeof render>>) =>
	screen.getByTestId("unseen").element().textContent;

const queuedStatus = (count: number | undefined): GlobalStatus => ({
	state: "SQ_QUEUED",
	url: SENDOUQ_LOOKING_PAGE,
	expiresAt: Date.now() + 30 * 60 * 1000,
	groupId: GROUP_ID,
	count,
});

const seedSeen = (seen: { groupId: number; seenCount: number }) =>
	window.localStorage.setItem(SEEN_SQ_LIKES_KEY, JSON.stringify(seen));

afterEach(() => {
	window.localStorage.clear();
});

describe("useHasUnseenSqLikes", () => {
	test("highlights likes with nothing seen yet", async () => {
		const screen = await render(<UnseenLikes status={queuedStatus(1)} />);

		expect(unseenStatus(screen)).toBe("unseen");
	});

	test("highlights likes seen on another group", async () => {
		seedSeen({ groupId: GROUP_ID + 1, seenCount: 5 });
		const screen = await render(<UnseenLikes status={queuedStatus(1)} />);

		expect(unseenStatus(screen)).toBe("unseen");
	});

	test.each([
		{ why: "more likes than seen", seenCount: 1, expected: "unseen" },
		{ why: "as many likes as seen", seenCount: 2, expected: "seen" },
		{ why: "fewer likes than seen", seenCount: 3, expected: "seen" },
	])("$why → $expected", async ({ seenCount, expected }) => {
		seedSeen({ groupId: GROUP_ID, seenCount });
		const screen = await render(<UnseenLikes status={queuedStatus(2)} />);

		expect(unseenStatus(screen)).toBe(expected);
	});

	test("never highlights without a status", async () => {
		const screen = await render(<UnseenLikes status={null} />);

		expect(unseenStatus(screen)).toBe("seen");
	});

	test("never highlights a status that is not queued", async () => {
		const screen = await render(
			<UnseenLikes status={{ state: "SQ_MATCH", url: SENDOUQ_LOOKING_PAGE }} />,
		);

		expect(unseenStatus(screen)).toBe("seen");
	});

	test("never highlights a queued status without likes", async () => {
		const screen = await render(<UnseenLikes status={queuedStatus(0)} />);

		expect(unseenStatus(screen)).toBe("seen");
	});
});

describe("useMarkSqLikesSeen", () => {
	test("persists the group's received likes as seen", async () => {
		await render(<MarkSeen groupId={GROUP_ID} receivedLikesCount={3} />);

		expect(window.localStorage.getItem(SEEN_SQ_LIKES_KEY)).toBe(
			JSON.stringify({ groupId: GROUP_ID, seenCount: 3 }),
		);
	});

	test("persists nothing without a group", async () => {
		await render(<MarkSeen groupId={undefined} receivedLikesCount={3} />);

		expect(window.localStorage.getItem(SEEN_SQ_LIKES_KEY)).toBeNull();
	});

	test("clears the highlight for the likes it marks seen", async () => {
		const screen = await render(
			<>
				<MarkSeen groupId={GROUP_ID} receivedLikesCount={2} />
				<UnseenLikes status={queuedStatus(2)} />
			</>,
		);

		expect(unseenStatus(screen)).toBe("seen");
	});
});
