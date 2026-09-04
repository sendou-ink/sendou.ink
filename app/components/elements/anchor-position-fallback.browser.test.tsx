import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { SendouPopover } from "./Popover";
import { SendouSelect, SendouSelectItem } from "./Select";

const SEASONS = [{ id: 1, name: "Season 1" }];

let disablingStyle: HTMLStyleElement | null = null;

afterEach(() => {
	disablingStyle?.remove();
	disablingStyle = null;
	vi.restoreAllMocks();
});

/** The test browser has anchor positioning, so the fallback has to be forced on. */
function disableAnchorPositioning() {
	vi.spyOn(CSS, "supports").mockReturnValue(false);

	disablingStyle = document.createElement("style");
	disablingStyle.textContent = `[popover] {
		position-area: none !important;
		justify-self: normal !important;
		align-self: normal !important;
	}`;
	document.head.append(disablingStyle);
}

function rectOf(element: Element) {
	return element.getBoundingClientRect();
}

describe("useAnchorPositionFallback", () => {
	test("centers the popover under its trigger", async () => {
		disableAnchorPositioning();
		const screen = await render(
			<div style={{ padding: "100px" }}>
				<SendouPopover trigger={<button type="button">Filters</button>}>
					Filter by season
				</SendouPopover>
			</div>,
		);

		const trigger = screen.getByRole("button", { name: "Filters" });
		await trigger.click();

		const triggerRect = rectOf(trigger.element());
		const popoverRect = rectOf(screen.getByRole("dialog").element());

		expect(popoverRect.top).toBeGreaterThanOrEqual(triggerRect.bottom);
		expect(
			Math.abs(
				popoverRect.left +
					popoverRect.width / 2 -
					(triggerRect.left + triggerRect.width / 2),
			),
		).toBeLessThan(2);
	});

	test("gives the select popover the width of its trigger", async () => {
		disableAnchorPositioning();
		const screen = await render(
			<div style={{ padding: "100px" }}>
				<SendouSelect
					label="Season"
					items={SEASONS}
					placeholder="Pick a season"
				>
					{({ id, name }: (typeof SEASONS)[number]) => (
						<SendouSelectItem key={id} id={id}>
							{name}
						</SendouSelectItem>
					)}
				</SendouSelect>
			</div>,
		);

		const trigger = screen.getByRole("button", { name: /Pick a season/ });
		await trigger.click();
		await expect
			.element(screen.getByRole("option", { name: "Season 1" }))
			.toBeVisible();

		const triggerRect = rectOf(trigger.element());
		const popover = document.querySelector("[popover]");
		const popoverRect = rectOf(popover as Element);

		expect(popoverRect.width).toBeCloseTo(triggerRect.width, 0);
		expect(popoverRect.left).toBeCloseTo(triggerRect.left, 0);
		expect(popoverRect.top).toBeGreaterThanOrEqual(triggerRect.bottom);
	});
});
