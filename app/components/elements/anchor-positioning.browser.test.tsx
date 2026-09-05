import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { SendouPopover } from "./Popover";
import { SendouSelect, SendouSelectItem } from "./Select";

const SEASONS = [{ id: 1, name: "Season 1" }];
const MANY_SEASONS = Array.from({ length: 40 }, (_, index) => ({
	id: index + 1,
	name: `Season ${index + 1}`,
}));

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

describe("useAnchorPositioning", () => {
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

	test("opens a select upwards when its options do not fit below the trigger", async () => {
		const screen = await render(<SelectNearViewportBottom />);

		const trigger = screen.getByRole("button", { name: /Pick a season/ });
		await trigger.click();
		await expect
			.element(screen.getByRole("option", { name: "Season 1", exact: true }))
			.toBeVisible();

		const triggerRect = rectOf(trigger.element());
		const popoverRect = rectOf(document.querySelector("[popover]") as Element);

		expect(popoverRect.bottom).toBeLessThanOrEqual(triggerRect.top);
		expect(popoverRect.top).toBeGreaterThanOrEqual(0);
	});

	test("keeps the select where it opened when searching shrinks the list", async () => {
		const screen = await render(<SelectNearViewportBottom />);

		const trigger = screen.getByRole("button", { name: /Pick a season/ });
		await trigger.click();
		await expect
			.element(screen.getByRole("option", { name: "Season 1", exact: true }))
			.toBeVisible();
		const popover = document.querySelector("[popover]") as Element;
		const bottomOnOpen = rectOf(popover).bottom;

		await screen.getByRole("combobox").fill("Season 40");
		await expect
			.element(screen.getByRole("option", { name: "Season 40" }))
			.toBeVisible();

		expect(rectOf(popover).bottom).toBeCloseTo(bottomOnOpen, 0);
	});
});

function SelectNearViewportBottom() {
	return (
		<div style={{ marginTop: "calc(100vh - 100px)" }}>
			<SendouSelect
				label="Season"
				items={MANY_SEASONS}
				placeholder="Pick a season"
				search={{ placeholder: "Search seasons..." }}
			>
				{({ id, name }: (typeof MANY_SEASONS)[number]) => (
					<SendouSelectItem key={id} id={id}>
						{name}
					</SendouSelectItem>
				)}
			</SendouSelect>
		</div>
	);
}
