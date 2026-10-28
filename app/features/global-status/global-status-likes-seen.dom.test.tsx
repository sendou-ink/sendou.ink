import { afterEach, describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
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
	status = null,
}: {
	groupId: number | undefined;
	receivedLikesCount: number;
	status?: GlobalStatus | null;
}) {
	useMarkSqLikesSeen({ groupId, receivedLikesCount, status });

	return null;
}

const unseenStatus = () => screen.getByTestId("unseen").textContent;

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
	test("highlights likes with nothing seen yet", () => {
		render(<UnseenLikes status={queuedStatus(1)} />);

		expect(unseenStatus()).toBe("unseen");
	});

	test("highlights likes seen on another group", () => {
		seedSeen({ groupId: GROUP_ID + 1, seenCount: 5 });
		render(<UnseenLikes status={queuedStatus(1)} />);

		expect(unseenStatus()).toBe("unseen");
	});

	test.each([
		{ why: "more likes than seen", seenCount: 1, expected: "unseen" },
		{ why: "as many likes as seen", seenCount: 2, expected: "seen" },
		{ why: "fewer likes than seen", seenCount: 3, expected: "seen" },
	])("$why → $expected", ({ seenCount, expected }) => {
		seedSeen({ groupId: GROUP_ID, seenCount });
		render(<UnseenLikes status={queuedStatus(2)} />);

		expect(unseenStatus()).toBe(expected);
	});

	test("never highlights without a status", () => {
		render(<UnseenLikes status={null} />);

		expect(unseenStatus()).toBe("seen");
	});

	test("never highlights a status that is not queued", () => {
		render(
			<UnseenLikes status={{ state: "SQ_MATCH", url: SENDOUQ_LOOKING_PAGE }} />,
		);

		expect(unseenStatus()).toBe("seen");
	});

	test("never highlights a queued status without likes", () => {
		render(<UnseenLikes status={queuedStatus(0)} />);

		expect(unseenStatus()).toBe("seen");
	});
});

describe("useMarkSqLikesSeen", () => {
	test("persists the group's received likes as seen", () => {
		render(<MarkSeen groupId={GROUP_ID} receivedLikesCount={3} />);

		expect(window.localStorage.getItem(SEEN_SQ_LIKES_KEY)).toBe(
			JSON.stringify({ groupId: GROUP_ID, seenCount: 3 }),
		);
	});

	test("persists nothing without a group", () => {
		render(<MarkSeen groupId={undefined} receivedLikesCount={3} />);

		expect(window.localStorage.getItem(SEEN_SQ_LIKES_KEY)).toBeNull();
	});

	test("clears the highlight for the likes it marks seen", () => {
		render(
			<>
				<MarkSeen groupId={GROUP_ID} receivedLikesCount={2} />
				<UnseenLikes status={queuedStatus(2)} />
			</>,
		);

		expect(unseenStatus()).toBe("seen");
	});

	test("clears the highlight while the header's count is ahead of the likes shown", () => {
		const status = queuedStatus(2);
		render(
			<>
				<MarkSeen groupId={GROUP_ID} receivedLikesCount={1} status={status} />
				<UnseenLikes status={status} />
			</>,
		);

		expect(unseenStatus()).toBe("seen");
	});
});
