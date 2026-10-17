import { beforeEach, describe, expect, test, vi } from "bun:test";
import { render } from "@testing-library/react";
import {
	SENDOUQ_LOOKING_PAGE,
	SENDOUQ_PREPARING_PAGE,
	SENDOUQ_READY_PAGE,
	sendouQMatchPage,
} from "~/utils/urls";
import { useGlobalStatusSounds } from "./global-status-sounds";
import type { GlobalStatus } from "./global-status-types";

const mocks = {
	playSound: vi.fn(),
	isLastActiveTab: vi.fn(() => true),
};

vi.mock("~/features/chat/core/Sounds", () => ({
	play: mocks.playSound,
}));

vi.mock("~/features/chat/core/Attention", () => ({
	tracker: { isLastActiveTab: mocks.isLastActiveTab },
}));

function Sounds({ status }: { status: GlobalStatus | null }) {
	useGlobalStatusSounds(status);

	return null;
}

/** Renders the first status, then the second, as the provider does when a fresher one lands. */
const transitionTo = (from: GlobalStatus | null, to: GlobalStatus | null) => {
	const screen = render(<Sounds status={from} />);
	screen.rerender(<Sounds status={to} />);
};

const queued = (overrides: Partial<GlobalStatus> = {}): GlobalStatus => ({
	state: "SQ_QUEUED",
	url: SENDOUQ_LOOKING_PAGE,
	groupId: 1,
	count: 0,
	...overrides,
});

describe("useGlobalStatusSounds", () => {
	beforeEach(() => {
		mocks.playSound.mockClear();
		mocks.isLastActiveTab.mockReturnValue(true);
		localStorage.clear();
	});

	test.each([
		["SQ_READY_CHECK", "sq_ready-check"],
		["SQ_MATCH", "sq_match"],
		["TO_MATCH", "tournament_match"],
	] as const)("plays %s's sound on moving into it", (state, sound) => {
		transitionTo(queued(), { state, url: SENDOUQ_READY_PAGE });

		expect(mocks.playSound).toHaveBeenCalledWith(sound);
	});

	test("stays silent for a status that is already there on the first render", () => {
		render(<Sounds status={{ state: "SQ_MATCH", url: sendouQMatchPage(1) }} />);

		expect(mocks.playSound).not.toHaveBeenCalled();
	});

	test("stays silent while the state is unchanged", () => {
		const match: GlobalStatus = { state: "SQ_MATCH", url: sendouQMatchPage(1) };
		transitionTo(match, { ...match });

		expect(mocks.playSound).not.toHaveBeenCalled();
	});

	test("stays silent for a state of its own with no sound", () => {
		transitionTo(queued(), {
			state: "SQ_PREPARING",
			url: SENDOUQ_PREPARING_PAGE,
		});

		expect(mocks.playSound).not.toHaveBeenCalled();
	});

	test("plays the like sound when the queued group's likes grow", () => {
		transitionTo(queued({ count: 1 }), queued({ count: 2 }));

		expect(mocks.playSound).toHaveBeenCalledWith("sq_like");
	});

	test("stays silent when the queued group's likes shrink", () => {
		transitionTo(queued({ count: 2 }), queued({ count: 1 }));

		expect(mocks.playSound).not.toHaveBeenCalled();
	});

	test("stays silent for likes carried over from another group", () => {
		transitionTo(
			queued({ groupId: 1, count: 0 }),
			queued({ groupId: 2, count: 3 }),
		);

		expect(mocks.playSound).not.toHaveBeenCalled();
	});

	test("stays silent for a moment another tab already announced", () => {
		const match: GlobalStatus = { state: "SQ_MATCH", url: sendouQMatchPage(1) };
		const staleTab = render(<Sounds status={queued()} />);
		transitionTo(queued(), match);
		mocks.playSound.mockClear();

		staleTab.rerender(<Sounds status={match} />);

		expect(mocks.playSound).not.toHaveBeenCalled();
	});

	test("stays silent for a like another tab already announced", () => {
		const staleTab = render(<Sounds status={queued({ count: 1 })} />);
		transitionTo(queued({ count: 1 }), queued({ count: 2 }));
		mocks.playSound.mockClear();

		staleTab.rerender(<Sounds status={queued({ count: 2 })} />);

		expect(mocks.playSound).not.toHaveBeenCalled();
	});

	test("plays a repeated ready check after the queued status was seen in between", () => {
		const readyCheck: GlobalStatus = {
			state: "SQ_READY_CHECK",
			url: SENDOUQ_READY_PAGE,
		};
		const screen = render(<Sounds status={queued()} />);
		screen.rerender(<Sounds status={readyCheck} />);
		screen.rerender(<Sounds status={queued()} />);
		mocks.playSound.mockClear();

		screen.rerender(<Sounds status={{ ...readyCheck }} />);

		expect(mocks.playSound).toHaveBeenCalledWith("sq_ready-check");
	});

	test("stays silent in a tab the user wasn't last active in", () => {
		mocks.isLastActiveTab.mockReturnValue(false);

		transitionTo(queued(), {
			state: "SQ_MATCH",
			url: sendouQMatchPage(1),
		});

		expect(mocks.playSound).not.toHaveBeenCalled();
	});

	test("plays in the last active tab even when another tab got the status first", () => {
		const match: GlobalStatus = { state: "SQ_MATCH", url: sendouQMatchPage(1) };
		const activeTab = render(<Sounds status={queued()} />);
		mocks.isLastActiveTab.mockReturnValue(false);
		transitionTo(queued(), match);
		mocks.isLastActiveTab.mockReturnValue(true);

		activeTab.rerender(<Sounds status={match} />);

		expect(mocks.playSound).toHaveBeenCalledWith("sq_match");
	});
});
