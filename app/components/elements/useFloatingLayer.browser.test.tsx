import { afterEach, describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { invariant } from "~/utils/invariant";
import { SendouPopover } from "./Popover";
import { SendouSelect, SendouSelectItem } from "./Select";
import { closeKeyboard, KEYBOARD_HEIGHT, openKeyboard } from "./tests/keyboard";

const SEASONS = [{ id: 1, name: "Season 1" }];
const MANY_SEASONS = Array.from({ length: 40 }, (_, index) => ({
	id: index + 1,
	name: `Season ${index + 1}`,
}));

afterEach(() => {
	window.scrollTo(0, 0);
	closeKeyboard();
});

function rectOf(element: Element) {
	return element.getBoundingClientRect();
}

function openPopover() {
	const popover = document.querySelector<HTMLElement>("[popover]");
	invariant(popover);
	return popover;
}

function lengthOf(element: Element, property: string) {
	return Number.parseFloat(
		getComputedStyle(element).getPropertyValue(property),
	);
}

/** A popover takes focus a frame after opening, scrolling itself into view, which would undo a scroll made before then. */
async function waitForFocus(popover: Element) {
	await vi.waitFor(() => expect(document.activeElement).toBe(popover));
}

function ManySeasonsSelect() {
	return (
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
	);
}

describe("useFloatingLayer", () => {
	test("centers the popover under its trigger", async () => {
		const screen = await render(
			<div style={{ padding: "100px" }}>
				<SendouPopover trigger={<button type="button">Filters</button>}>
					Filter by season
				</SendouPopover>
			</div>,
		);

		const trigger = screen.getByRole("button", { name: "Filters" });
		await trigger.click();

		const popover = screen.getByRole("dialog").element();
		const triggerRect = rectOf(trigger.element());
		const popoverRect = rectOf(popover);

		expect(popoverRect.top).toBeCloseTo(
			triggerRect.bottom + lengthOf(popover, "--floating-gap"),
			0,
		);
		expect(
			Math.abs(
				popoverRect.left +
					popoverRect.width / 2 -
					(triggerRect.left + triggerRect.width / 2),
			),
		).toBeLessThan(2);
		expect(popover.getAttribute("data-side")).toBe("bottom");
		expect(popover.getAttribute("data-align")).toBe("center");
	});

	test("gives the select popover the width of its trigger", async () => {
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
		const popoverRect = rectOf(openPopover());

		expect(popoverRect.width).toBeCloseTo(triggerRect.width, 0);
		expect(popoverRect.left).toBeCloseTo(triggerRect.left, 0);
		expect(popoverRect.top).toBeGreaterThanOrEqual(triggerRect.bottom);
	});

	test("opens a select upwards when its options do not fit below the trigger", async () => {
		const screen = await render(
			<div style={{ marginTop: "calc(100vh - 100px)" }}>
				<ManySeasonsSelect />
			</div>,
		);

		const trigger = screen.getByRole("button", { name: /Pick a season/ });
		await trigger.click();
		await expect
			.element(screen.getByRole("option", { name: "Season 1", exact: true }))
			.toBeVisible();

		const triggerRect = rectOf(trigger.element());
		const popover = openPopover();
		const popoverRect = rectOf(popover);

		expect(popoverRect.bottom).toBeLessThanOrEqual(triggerRect.top);
		expect(popoverRect.top).toBeGreaterThanOrEqual(0);
		expect(popover.getAttribute("data-side")).toBe("top");
	});

	test("caps a long select to the space below its trigger", async () => {
		const screen = await render(
			<div style={{ padding: "100px" }}>
				<ManySeasonsSelect />
			</div>,
		);

		const trigger = screen.getByRole("button", { name: /Pick a season/ });
		await trigger.click();
		await expect
			.element(screen.getByRole("option", { name: "Season 1", exact: true }))
			.toBeVisible();

		const popover = openPopover();
		const listbox = screen.getByRole("listbox").element();
		const spaceBelow = Math.floor(
			window.innerHeight -
				lengthOf(popover, "--popover-boundary-bottom") -
				rectOf(trigger.element()).bottom -
				lengthOf(popover, "--floating-gap") -
				lengthOf(popover, "--floating-viewport-padding"),
		);

		expect(lengthOf(popover, "--floating-available-height")).toBe(spaceBelow);
		expect(Number.parseFloat(getComputedStyle(popover).maxHeight)).toBe(
			spaceBelow,
		);
		expect(rectOf(popover).bottom).toBeLessThanOrEqual(window.innerHeight);
		expect(listbox.scrollHeight).toBeGreaterThan(listbox.clientHeight);
	});

	test("keeps the select where it opened when searching shrinks the list", async () => {
		const screen = await render(
			<div style={{ marginTop: "calc(100vh - 100px)" }}>
				<ManySeasonsSelect />
			</div>,
		);

		const trigger = screen.getByRole("button", { name: /Pick a season/ });
		await trigger.click();
		await expect
			.element(screen.getByRole("option", { name: "Season 1", exact: true }))
			.toBeVisible();
		const popover = openPopover();
		const bottomOnOpen = rectOf(popover).bottom;

		await screen.getByRole("combobox").fill("Season 40");
		await expect
			.element(screen.getByRole("option", { name: "Season 40" }))
			.toBeVisible();

		expect(rectOf(popover).bottom).toBeCloseTo(bottomOnOpen, 0);
	});

	test("follows its trigger when the page scrolls", async () => {
		const screen = await render(
			<div style={{ padding: "100px", height: "300vh" }}>
				<SendouPopover trigger={<button type="button">Filters</button>}>
					Filter by season
				</SendouPopover>
			</div>,
		);

		const trigger = screen.getByRole("button", { name: "Filters" });
		await trigger.click();
		const popover = screen.getByRole("dialog").element();
		const gap = lengthOf(popover, "--floating-gap");
		await waitForFocus(popover);

		window.scrollTo(0, 40);

		await vi.waitFor(() => {
			expect(rectOf(popover).top).toBeCloseTo(
				rectOf(trigger.element()).bottom + gap,
				0,
			);
		});
		expect(popover.matches(":popover-open")).toBe(true);
	});

	test("keeps a select out from under the keyboard taking the space below it", async () => {
		const screen = await render(
			<div style={{ padding: "100px" }}>
				<ManySeasonsSelect />
			</div>,
		);

		const trigger = screen.getByRole("button", { name: /Pick a season/ });
		await trigger.click();
		await expect
			.element(screen.getByRole("option", { name: "Season 1", exact: true }))
			.toBeVisible();
		const popover = openPopover();
		const viewport = window.visualViewport;
		invariant(viewport);
		expect(rectOf(popover).bottom).toBeGreaterThan(
			viewport.height - KEYBOARD_HEIGHT,
		);

		openKeyboard();

		await vi.waitFor(() => {
			expect(rectOf(popover).bottom).toBeLessThanOrEqual(viewport.height);
		});
		expect(popover.matches(":popover-open")).toBe(true);
	});

	test("flips over when scrolling leaves it more room on the other side", async () => {
		const screen = await render(
			<div style={{ marginTop: "calc(100vh - 100px)", height: "300vh" }}>
				<ManySeasonsSelect />
			</div>,
		);

		const trigger = screen.getByRole("button", { name: /Pick a season/ });
		await trigger.click();
		await expect
			.element(screen.getByRole("option", { name: "Season 1", exact: true }))
			.toBeVisible();
		const popover = openPopover();
		expect(popover.getAttribute("data-side")).toBe("top");

		window.scrollTo(0, 400);

		await vi.waitFor(() => {
			expect(popover.getAttribute("data-side")).toBe("bottom");
		});
		expect(rectOf(popover).top).toBeCloseTo(
			rectOf(trigger.element()).bottom + lengthOf(popover, "--floating-gap"),
			0,
		);
		expect(popover.matches(":popover-open")).toBe(true);
	});

	test("keeps above the mobile nav's floor", async () => {
		const { innerWidth, innerHeight } = window;
		const root = document.documentElement;
		const floorBefore = root.style.getPropertyValue(
			"--popover-boundary-bottom",
		);
		await page.viewport(375, 667);
		// what the layout sets at the mobile breakpoint, with no layout rendered here
		root.style.setProperty("--popover-boundary-bottom", "55px");

		try {
			const screen = await render(
				<div style={{ padding: "100px" }}>
					<ManySeasonsSelect />
				</div>,
			);
			const trigger = screen.getByRole("button", { name: /Pick a season/ });
			await trigger.click();
			await expect
				.element(screen.getByRole("option", { name: "Season 1", exact: true }))
				.toBeVisible();

			const popover = openPopover();
			const floor = lengthOf(popover, "--popover-boundary-bottom");
			expect(floor).toBeGreaterThan(0);
			expect(rectOf(popover).bottom).toBeLessThanOrEqual(
				window.innerHeight - floor,
			);
		} finally {
			root.style.setProperty("--popover-boundary-bottom", floorBefore);
			await page.viewport(innerWidth, innerHeight);
		}
	});

	test("caps the content again after the viewport shrinks with the popover above its trigger", async () => {
		const { innerWidth, innerHeight } = window;

		try {
			// pixels rather than viewport units, so the trigger stays put when the
			// viewport shrinks, and high enough up to stay in view once it has
			const screen = await render(
				<div style={{ marginTop: innerHeight - 200, height: "300vh" }}>
					<ManySeasonsSelect />
				</div>,
			);
			const trigger = screen.getByRole("button", { name: /Pick a season/ });
			await trigger.click();
			await expect
				.element(screen.getByRole("option", { name: "Season 1", exact: true }))
				.toBeVisible();
			const popover = openPopover();
			expect(popover.getAttribute("data-side")).toBe("top");

			await page.viewport(innerWidth, innerHeight - 40);

			await vi.waitFor(() => {
				expect(
					Number.parseFloat(getComputedStyle(popover).maxHeight),
				).toBeLessThanOrEqual(window.innerHeight);
			});
			expect(getComputedStyle(popover).visibility).toBe("visible");
			expect(rectOf(popover).top).toBeGreaterThanOrEqual(0);
		} finally {
			await page.viewport(innerWidth, innerHeight);
		}
	});

	test("stays put under an anchor in a sticky header while the page scrolls", async () => {
		const screen = await render(
			<div style={{ height: "300vh" }}>
				<header style={{ position: "sticky", top: 0, padding: 20 }}>
					<SendouPopover trigger={<button type="button">Filters</button>}>
						Filter by season
					</SendouPopover>
				</header>
			</div>,
		);

		const trigger = screen.getByRole("button", { name: "Filters" });
		await trigger.click();
		const popover = screen.getByRole("dialog").element();
		const topBefore = rectOf(popover).top;
		expect(getComputedStyle(popover).position).toBe("fixed");
		await waitForFocus(popover);

		window.scrollTo(0, 200);
		await new Promise((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(resolve)),
		);

		expect(rectOf(popover).top).toBeCloseTo(topBefore, 0);
		expect(rectOf(popover).top).toBeCloseTo(
			rectOf(trigger.element()).bottom + lengthOf(popover, "--floating-gap"),
			0,
		);
	});

	test("hides while its trigger is scrolled out of sight and shows again once it is back", async () => {
		const screen = await render(
			<div style={{ padding: "100px", height: "300vh" }}>
				<SendouPopover trigger={<button type="button">Filters</button>}>
					Filter by season
				</SendouPopover>
			</div>,
		);

		await screen.getByRole("button", { name: "Filters" }).click();
		const popover = screen.getByRole("dialog").element();
		expect(getComputedStyle(popover).visibility).toBe("visible");
		await waitForFocus(popover);

		window.scrollTo(0, 600);
		await vi.waitFor(() => {
			expect(getComputedStyle(popover).visibility).toBe("hidden");
		});
		expect(popover.matches(":popover-open")).toBe(true);

		window.scrollTo(0, 0);
		await vi.waitFor(() => {
			expect(getComputedStyle(popover).visibility).toBe("visible");
		});
	});

	test("hides once a scrolling container clips its trigger", async () => {
		const screen = await render(
			<div data-testid="scroller" style={{ height: 200, overflow: "auto" }}>
				<div style={{ padding: "20px 0" }}>
					<SendouPopover trigger={<button type="button">Filters</button>}>
						Filter by season
					</SendouPopover>
				</div>
				<div style={{ height: 1000 }} />
			</div>,
		);

		await screen.getByRole("button", { name: "Filters" }).click();
		const popover = screen.getByRole("dialog").element();
		const scroller = document.querySelector<HTMLElement>(
			'[data-testid="scroller"]',
		);
		invariant(scroller);
		await waitForFocus(popover);

		scroller.scrollTop = 300;

		await vi.waitFor(() => {
			expect(getComputedStyle(popover).visibility).toBe("hidden");
		});
	});
});
