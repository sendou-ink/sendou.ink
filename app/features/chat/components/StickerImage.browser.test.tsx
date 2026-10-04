import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import * as Stickers from "../core/Stickers";
import { StickerImage } from "./StickerImage";

const state = vi.hoisted(() => ({ attending: true, reducedMotion: false }));

vi.mock("../chat-hooks", () => ({
	useIsAttending: () => state.attending,
}));

vi.mock("~/hooks/usePrefersReducedMotion", () => ({
	usePrefersReducedMotion: () => state.reducedMotion,
}));

describe("StickerImage", () => {
	test.each([
		{
			why: "plays while paying attention",
			attending: true,
			reducedMotion: false,
			paused: false,
		},
		{
			why: "holds still while not paying attention",
			attending: false,
			reducedMotion: false,
			paused: true,
		},
		{
			why: "holds still for reduced motion",
			attending: true,
			reducedMotion: true,
			paused: true,
		},
	])("$why", async ({ attending, reducedMotion, paused }) => {
		state.attending = attending;
		state.reducedMotion = reducedMotion;

		const screen = await render(
			<StickerImage
				sticker={Stickers.CHAT_STICKERS[0]}
				size={96}
				data-testid="sticker"
			/>,
		);

		const sticker = screen.getByTestId("sticker");
		if (paused) {
			await expect.element(sticker).toHaveAttribute("data-paused", "true");
		} else {
			await expect.element(sticker).not.toHaveAttribute("data-paused");
		}
	});
});
