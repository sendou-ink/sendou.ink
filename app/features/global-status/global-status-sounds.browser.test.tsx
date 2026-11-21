import { beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
	SENDOUQ_LOOKING_PAGE,
	SENDOUQ_PREPARING_PAGE,
	SENDOUQ_READY_PAGE,
	sendouQMatchPage,
} from "~/utils/urls";
import { useGlobalStatusSounds } from "./global-status-sounds";
import type { GlobalStatus } from "./global-status-types";

const mocks = vi.hoisted(() => ({
	playSound: vi.fn(),
	isLastActiveTab: vi.fn(() => true),
}));

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
const transitionTo = async (
	from: GlobalStatus | null,
	to: GlobalStatus | null,
) => {
	const screen = await render(<Sounds status={from} />);
	await screen.rerender(<Sounds status={to} />);
};

const tournamentMatchPage = "/to/1/matches/1";

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
	] as const)("plays %s's sound on moving into it", async (state, sound) => {
		await transitionTo(queued(), { state, url: SENDOUQ_READY_PAGE });

		expect(mocks.playSound).toHaveBeenCalledWith(sound);
	});

	test("stays silent for a status that is already there on the first render", async () => {
		await render(
			<Sounds status={{ state: "SQ_MATCH", url: sendouQMatchPage(1) }} />,
		);

		expect(mocks.playSound).not.toHaveBeenCalled();
	});

	test("stays silent while the state is unchanged", async () => {
		const match: GlobalStatus = { state: "SQ_MATCH", url: sendouQMatchPage(1) };
		await transitionTo(match, { ...match });

		expect(mocks.playSound).not.toHaveBeenCalled();
	});

	test("stays silent for a state of its own with no sound", async () => {
		await transitionTo(queued(), {
			state: "SQ_PREPARING",
			url: SENDOUQ_PREPARING_PAGE,
		});

		expect(mocks.playSound).not.toHaveBeenCalled();
	});

	test("stays silent when a LAN match starts waiting for a station", async () => {
		await transitionTo(
			{ state: "TO_WAITING_FOR_MATCH", url: tournamentMatchPage },
			{ state: "TO_WAITING_FOR_STATION", url: tournamentMatchPage },
		);

		expect(mocks.playSound).not.toHaveBeenCalled();
	});

	test("plays the tournament match sound when a LAN match gets its station", async () => {
		await transitionTo(
			{ state: "TO_WAITING_FOR_STATION", url: tournamentMatchPage },
			{ state: "TO_MATCH", url: tournamentMatchPage },
		);

		expect(mocks.playSound).toHaveBeenCalledWith("tournament_match");
	});

	test("plays the like sound when the queued group's likes grow", async () => {
		await transitionTo(queued({ count: 1 }), queued({ count: 2 }));

		expect(mocks.playSound).toHaveBeenCalledWith("sq_like");
	});

	test("stays silent when the queued group's likes shrink", async () => {
		await transitionTo(queued({ count: 2 }), queued({ count: 1 }));

		expect(mocks.playSound).not.toHaveBeenCalled();
	});

	test("stays silent for likes carried over from another group", async () => {
		await transitionTo(
			queued({ groupId: 1, count: 0 }),
			queued({ groupId: 2, count: 3 }),
		);

		expect(mocks.playSound).not.toHaveBeenCalled();
	});

	test("stays silent for a moment another tab already announced", async () => {
		const match: GlobalStatus = { state: "SQ_MATCH", url: sendouQMatchPage(1) };
		const staleTab = await render(<Sounds status={queued()} />);
		await transitionTo(queued(), match);
		mocks.playSound.mockClear();

		await staleTab.rerender(<Sounds status={match} />);

		expect(mocks.playSound).not.toHaveBeenCalled();
	});

	test("stays silent for a like another tab already announced", async () => {
		const staleTab = await render(<Sounds status={queued({ count: 1 })} />);
		await transitionTo(queued({ count: 1 }), queued({ count: 2 }));
		mocks.playSound.mockClear();

		await staleTab.rerender(<Sounds status={queued({ count: 2 })} />);

		expect(mocks.playSound).not.toHaveBeenCalled();
	});

	test("plays a repeated ready check after the queued status was seen in between", async () => {
		const readyCheck: GlobalStatus = {
			state: "SQ_READY_CHECK",
			url: SENDOUQ_READY_PAGE,
		};
		const screen = await render(<Sounds status={queued()} />);
		await screen.rerender(<Sounds status={readyCheck} />);
		await screen.rerender(<Sounds status={queued()} />);
		mocks.playSound.mockClear();

		await screen.rerender(<Sounds status={{ ...readyCheck }} />);

		expect(mocks.playSound).toHaveBeenCalledWith("sq_ready-check");
	});

	test("stays silent in a tab the user wasn't last active in", async () => {
		mocks.isLastActiveTab.mockReturnValue(false);

		await transitionTo(queued(), {
			state: "SQ_MATCH",
			url: sendouQMatchPage(1),
		});

		expect(mocks.playSound).not.toHaveBeenCalled();
	});

	test("plays in the last active tab even when another tab got the status first", async () => {
		const match: GlobalStatus = { state: "SQ_MATCH", url: sendouQMatchPage(1) };
		const activeTab = await render(<Sounds status={queued()} />);
		mocks.isLastActiveTab.mockReturnValue(false);
		await transitionTo(queued(), match);
		mocks.isLastActiveTab.mockReturnValue(true);

		await activeTab.rerender(<Sounds status={match} />);

		expect(mocks.playSound).toHaveBeenCalledWith("sq_match");
	});
});
