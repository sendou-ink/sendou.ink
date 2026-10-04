import { describe, expect, test, vi } from "vitest";
import * as MentionAlerts from "./MentionAlerts";

function setup({
	attending = true,
	lastActiveTab = true,
}: {
	attending?: boolean;
	lastActiveTab?: boolean;
} = {}) {
	const state = { attending };
	const listeners = new Set<() => void>();
	const playSound = vi.fn();
	const resolveMentions = vi.fn();

	const alerts = MentionAlerts.create({
		attention: {
			isAttending: () => state.attending,
			isLastActiveTab: () => lastActiveTab,
			subscribe: (listener) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
		},
		playSound,
		resolveMentions,
	});

	return {
		alerts,
		playSound,
		resolveMentions,
		comeBack: () => {
			state.attending = true;
			for (const listener of listeners) listener();
		},
	};
}

describe("MentionAlerts.create", () => {
	test("a mention in a viewed room needs no alert, reading resolves it", () => {
		const { alerts, playSound, resolveMentions } = setup();

		alerts.handleMention({ roomId: 1, roomViewed: true });

		expect(playSound).not.toHaveBeenCalled();
		expect(resolveMentions).not.toHaveBeenCalled();
	});

	test("a mention while active on the site plays the sound and resolves it right away", () => {
		const { alerts, playSound, resolveMentions } = setup();

		alerts.handleMention({ roomId: 1, roomViewed: false });

		expect(playSound).toHaveBeenCalledTimes(1);
		expect(resolveMentions).toHaveBeenCalledWith(1);
	});

	test("a mention while away plays the sound and resolves once the user is back", () => {
		const { alerts, playSound, resolveMentions, comeBack } = setup({
			attending: false,
		});

		alerts.handleMention({ roomId: 1, roomViewed: false });
		alerts.handleMention({ roomId: 2, roomViewed: false });

		expect(playSound).toHaveBeenCalledTimes(2);
		expect(resolveMentions).not.toHaveBeenCalled();

		comeBack();

		expect(resolveMentions.mock.calls).toEqual([[1], [2]]);
	});

	test("only the last active tab plays the sound", () => {
		const { alerts, playSound } = setup({ lastActiveTab: false });

		alerts.handleMention({ roomId: 1, roomViewed: false });

		expect(playSound).not.toHaveBeenCalled();
	});
});
