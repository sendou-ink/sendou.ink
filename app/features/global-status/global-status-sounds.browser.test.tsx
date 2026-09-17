import { beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
	SENDOUQ_LOOKING_PAGE,
	SENDOUQ_PREPARING_PAGE,
	SENDOUQ_READY_PAGE,
	sendouQMatchPage,
} from "~/utils/urls";
import type { GlobalStatus } from "./GlobalStatusProvider";
import { useGlobalStatusSounds } from "./global-status-sounds";

const mocks = vi.hoisted(() => ({
	playSound: vi.fn(),
}));

vi.mock("~/features/chat/chat-utils", () => ({
	playSound: mocks.playSound,
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
});
