import * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabPanels,
	SendouTabs,
} from "~/components/elements/Tabs";

const NARROW_WIDTH = 400;
const WIDE_WIDTH = 1000;

type PaneKey = "zero" | "one" | "two" | "three";

function SwipeableTabs({
	width = NARROW_WIDTH,
	panes = ["one", "two", "three"],
	paneHeight = 100,
	defaultSelectedKey,
	selectedKey,
	onSelectionChange,
	spaceAbove = 0,
}: {
	width?: number;
	panes?: PaneKey[];
	paneHeight?: number;
	defaultSelectedKey?: PaneKey;
	selectedKey?: PaneKey;
	onSelectionChange?: (key: PaneKey) => void;
	spaceAbove?: number;
}) {
	return (
		<div style={{ width }}>
			<div style={{ height: spaceAbove }} />
			<SendouTabs
				swipeable
				defaultSelectedKey={defaultSelectedKey}
				selectedKey={selectedKey}
				onSelectionChange={(key) => onSelectionChange?.(key as PaneKey)}
			>
				<SendouTabList>
					{panes.map((key) => (
						<SendouTab key={key} id={key}>
							Tab {key}
						</SendouTab>
					))}
				</SendouTabList>
				<SendouTabPanels>
					{panes.map((key) => (
						<SendouTabPanel key={key} id={key}>
							<div style={{ height: key === "one" ? paneHeight : 100 }}>
								Panel {key}
								<input
									aria-label={`Hidden input ${key}`}
									style={{ position: "absolute", width: 1, height: 1 }}
								/>
							</div>
						</SendouTabPanel>
					))}
				</SendouTabPanels>
			</SendouTabs>
		</div>
	);
}

function SwipeableTabsGainingAPane() {
	const [panes, setPanes] = React.useState<PaneKey[]>(["one", "two", "three"]);

	return (
		<>
			<button type="button" onClick={() => setPanes(["zero", ...panes])}>
				Add
			</button>
			<SwipeableTabs panes={panes} />
		</>
	);
}

function SwipeableTabsSelectedElsewhere() {
	const [selectedKey, setSelectedKey] = React.useState<PaneKey>("one");

	return (
		<>
			<button type="button" onClick={() => setSelectedKey("three")}>
				Select three
			</button>
			<SwipeableTabs
				selectedKey={selectedKey}
				onSelectionChange={setSelectedKey}
			/>
		</>
	);
}

function ResizableSwipeableTabs({
	initialWidth,
	defaultSelectedKey,
}: {
	initialWidth: number;
	defaultSelectedKey?: PaneKey;
}) {
	const [width, setWidth] = React.useState(initialWidth);

	return (
		<>
			<button type="button" onClick={() => setWidth(300)}>
				Narrow
			</button>
			<div style={{ marginInlineStart: 50 }}>
				<SwipeableTabs width={width} defaultSelectedKey={defaultSelectedKey} />
			</div>
		</>
	);
}

function renderInRouter(element: React.ReactNode) {
	const router = createMemoryRouter([{ path: "*", element }], {
		initialEntries: ["/"],
	});
	return render(<RouterProvider router={router} />);
}

function tab(name: PaneKey) {
	return document.getElementById(`tab-${name}`)!;
}

function pane(name: PaneKey) {
	return document.querySelector<HTMLElement>(`[data-pane="${name}"]`)!;
}

function strip() {
	return pane("one").parentElement!;
}

function isPaneInView(name: PaneKey) {
	return (
		Math.abs(
			pane(name).getBoundingClientRect().left -
				strip().getBoundingClientRect().left,
		) < 1
	);
}

async function waitUntilPaneInView(name: PaneKey) {
	await vi.waitFor(() => {
		expect(isPaneInView(name)).toBe(true);
	}, 3000);
}

function recordSelectedTabs() {
	const selectedTabs: string[] = [];
	const observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			const element = mutation.target as HTMLElement;
			if (element.getAttribute("aria-selected") === "true") {
				selectedTabs.push(element.textContent ?? "");
			}
		}
	});
	for (const element of document.querySelectorAll("[role='tab']")) {
		observer.observe(element, { attributeFilter: ["aria-selected"] });
	}

	return selectedTabs;
}

describe("useSwipeablePanes", () => {
	test("selects the tab of the pane scrolled into view", async () => {
		await renderInRouter(<SwipeableTabs />);

		pane("two").scrollIntoView({ inline: "start", block: "nearest" });

		await expect.element(tab("two")).toHaveAttribute("aria-selected", "true");
	});

	test("scrolls to a tab's pane when it is clicked", async () => {
		await renderInRouter(<SwipeableTabs />);

		await userEvent.click(tab("three"));

		await waitUntilPaneInView("three");
		await expect.element(tab("three")).toHaveAttribute("aria-selected", "true");
	});

	test("keeps the clicked tab selected while scrolling past the panes in between", async () => {
		await renderInRouter(<SwipeableTabs />);
		const selectedTabs = recordSelectedTabs();

		await userEvent.click(tab("three"));
		await waitUntilPaneInView("three");

		expect(new Set(selectedTabs)).toEqual(new Set(["Tab three"]));
	});

	test("hands the tabs back to the scroll position when a swipe interrupts a tab click's scroll", async () => {
		await renderInRouter(<SwipeableTabs />);

		await userEvent.click(tab("three"));
		await vi.waitFor(() => {
			expect(strip().scrollLeft).toBeGreaterThan(0);
		}, 3000);
		strip().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
		strip().scrollTo({ left: 0, behavior: "instant" });

		await expect.element(tab("one")).toHaveAttribute("aria-selected", "true");

		pane("two").scrollIntoView({ inline: "start", block: "nearest" });

		await expect.element(tab("two")).toHaveAttribute("aria-selected", "true");
	});

	test("opens on the selected pane", async () => {
		await renderInRouter(<SwipeableTabs defaultSelectedKey="three" />);

		await expect.element(tab("three")).toHaveAttribute("aria-selected", "true");
		expect(isPaneInView("three")).toBe(true);
	});

	test("stays on the selected pane when a pane is added before it", async () => {
		const screen = await renderInRouter(<SwipeableTabsGainingAPane />);
		await userEvent.click(tab("two"));
		await waitUntilPaneInView("two");

		await userEvent.click(screen.getByRole("button", { name: "Add" }));

		await expect.element(tab("two")).toHaveAttribute("aria-selected", "true");
		await expect.poll(() => isPaneInView("two")).toBe(true);
	});

	test("moves to the pane selected from outside the strip", async () => {
		const screen = await renderInRouter(<SwipeableTabsSelectedElsewhere />);

		await userEvent.click(screen.getByRole("button", { name: "Select three" }));

		await expect.element(tab("three")).toHaveAttribute("aria-selected", "true");
		await expect.poll(() => isPaneInView("three")).toBe(true);
	});

	test("stays on the selected pane when the strip gets narrower", async () => {
		const screen = await renderInRouter(
			<ResizableSwipeableTabs
				initialWidth={NARROW_WIDTH}
				defaultSelectedKey="three"
			/>,
		);

		await userEvent.click(screen.getByRole("button", { name: "Narrow" }));

		await expect.poll(() => isPaneInView("three")).toBe(true);
	});

	test("shows the pane of a tab clicked on a wide screen once the screen narrows", async () => {
		const screen = await renderInRouter(
			<ResizableSwipeableTabs initialWidth={WIDE_WIDTH} />,
		);

		await userEvent.click(tab("two"));
		await userEvent.click(screen.getByRole("button", { name: "Narrow" }));

		await expect.element(tab("two")).toHaveAttribute("aria-selected", "true");
		await expect.poll(() => isPaneInView("two")).toBe(true);
	});

	test("makes the panes out of view inert", async () => {
		await renderInRouter(<SwipeableTabs />);

		expect(pane("one").inert).toBe(false);
		expect(pane("two").inert).toBe(true);
		expect(pane("three").inert).toBe(true);
	});

	test("keeps absolutely positioned bits of the panes from widening the page", async () => {
		await renderInRouter(<SwipeableTabs defaultSelectedKey="three" />);
		const pageWidth = document.documentElement.clientWidth;

		await expect
			.poll(() => document.documentElement.scrollWidth)
			.toBe(pageWidth);
	});

	test("shows only the selected panel on wide screens", async () => {
		const screen = await renderInRouter(<SwipeableTabs width={WIDE_WIDTH} />);

		await expect.element(screen.getByText("Panel one")).toBeVisible();
		await expect.element(screen.getByText("Panel two")).not.toBeVisible();

		await userEvent.click(tab("two"));

		await expect.element(screen.getByText("Panel two")).toBeVisible();
		await expect.element(screen.getByText("Panel one")).not.toBeVisible();
	});

	test("scrolls the page back up to the tabs when swiping to another pane from deep down a pane", async () => {
		const screen = await renderInRouter(<SwipeableTabs paneHeight={3000} />);
		const tabs = screen.getByRole("tablist").element();
		window.scrollTo({ top: 2000, behavior: "instant" });

		strip().scrollTo({ left: strip().scrollWidth, behavior: "instant" });

		await vi.waitFor(() => {
			expect(tabs.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
		}, 3000);
	});

	test("waits for the finger to lift before scrolling the page back up", async () => {
		const screen = await renderInRouter(<SwipeableTabs paneHeight={3000} />);
		const tabs = screen.getByRole("tablist").element();
		window.scrollTo({ top: 2000, behavior: "instant" });

		strip().dispatchEvent(new TouchEvent("touchstart", { bubbles: true }));
		strip().scrollTo({ left: strip().scrollWidth, behavior: "instant" });

		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(window.scrollY).toBe(2000);

		strip().dispatchEvent(new TouchEvent("touchend", { bubbles: true }));

		await vi.waitFor(() => {
			expect(tabs.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
		}, 3000);
	});

	test("leaves the page where it is when swiping to another pane with the tabs still in view", async () => {
		const screen = await renderInRouter(
			<SwipeableTabs paneHeight={3000} spaceAbove={1000} />,
		);
		const tabs = screen.getByRole("tablist").element();
		const stickyHeaderHeight =
			Number.parseFloat(
				getComputedStyle(document.documentElement).scrollPaddingTop,
			) || 0;
		const tabsTop = tabs.getBoundingClientRect().top + window.scrollY;
		const partlyScrolledPastTabs =
			tabsTop - stickyHeaderHeight + tabs.getBoundingClientRect().height / 2;
		window.scrollTo({ top: partlyScrolledPastTabs, behavior: "instant" });

		strip().scrollTo({ left: strip().scrollWidth, behavior: "instant" });

		await vi.waitFor(() => {
			expect(tab("three").getAttribute("aria-selected")).toBe("true");
		});
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(window.scrollY).toBe(partlyScrolledPastTabs);
	});
});
