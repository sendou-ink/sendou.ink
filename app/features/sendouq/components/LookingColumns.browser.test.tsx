import * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { LookingColumns } from "./LookingColumns";

const NARROW_WIDTH = 400;
const WIDE_WIDTH = 1000;

async function renderColumns(width: number) {
	return renderInRouter(
		<div style={{ containerType: "inline-size", width }}>
			<LookingColumns
				flipKey={null}
				own={{ memberCount: 1, content: <div>Own group</div> }}
				invited={<div>Invited group</div>}
				available={<div style={{ height: 600 }}>Available group</div>}
				availableCount={1}
				received={<div>Received group</div>}
				receivedCount={1}
			/>
		</div>,
	);
}

function renderInRouter(element: React.ReactNode) {
	const router = createMemoryRouter([{ path: "*", element }], {
		initialEntries: ["/"],
	});
	return render(<RouterProvider router={router} />);
}

function ColumnsWithRemovableReceivedCard() {
	const [receivedIds, setReceivedIds] = React.useState([1, 2]);

	return (
		<div style={{ containerType: "inline-size", width: NARROW_WIDTH }}>
			<button type="button" onClick={() => setReceivedIds([1])}>
				Remove
			</button>
			<LookingColumns
				flipKey={receivedIds}
				own={null}
				invited={null}
				available={<div>Available group</div>}
				availableCount={1}
				received={receivedIds.map((id) => (
					<div key={id} data-flip-id={id} style={{ height: 50 }}>
						Received group {id}
					</div>
				))}
				receivedCount={receivedIds.length}
			/>
		</div>
	);
}

function renderTallColumns() {
	return renderInRouter(
		<div style={{ containerType: "inline-size", width: NARROW_WIDTH }}>
			<LookingColumns
				flipKey={null}
				own={null}
				invited={null}
				available={<div style={{ height: 3000 }}>Available group</div>}
				availableCount={1}
				received={<div>Received group</div>}
				receivedCount={1}
			/>
		</div>,
	);
}

function recordSelectedTabs() {
	const selectedTabs: string[] = [];
	const observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			const tab = mutation.target as HTMLElement;
			if (tab.getAttribute("aria-selected") === "true") {
				selectedTabs.push(tab.textContent ?? "");
			}
		}
	});
	for (const tab of document.querySelectorAll("[role='tab']")) {
		observer.observe(tab, { attributeFilter: ["aria-selected"] });
	}

	return selectedTabs;
}

function pane(name: "groups" | "received" | "own") {
	return document.querySelector<HTMLElement>(`[data-pane="${name}"]`)!;
}

async function waitUntilPaneInView(name: "groups" | "received" | "own") {
	const strip = pane(name).closest<HTMLElement>("[class*='strip']")!;
	await vi.waitFor(() => {
		expect(
			Math.abs(
				pane(name).getBoundingClientRect().left -
					strip.getBoundingClientRect().left,
			),
		).toBeLessThan(1);
	}, 3000);
}

describe("LookingColumns", () => {
	test("puts the invited groups under the own group on wide screens", async () => {
		const screen = await renderColumns(WIDE_WIDTH);

		const own = screen.getByText("Own group").element().getBoundingClientRect();
		const invited = screen
			.getByText("Invited group")
			.element()
			.getBoundingClientRect();
		const available = screen
			.getByText("Available group")
			.element()
			.getBoundingClientRect();

		expect(invited.left).toBe(own.left);
		expect(invited.top).toBeGreaterThan(own.bottom);
		expect(invited.top).toBeLessThan(available.bottom);
		expect(available.left).toBeGreaterThan(own.right);
	});

	test("selects the tab of the pane scrolled into view", async () => {
		const screen = await renderColumns(NARROW_WIDTH);

		pane("received").scrollIntoView({ inline: "start", block: "nearest" });

		await expect
			.element(screen.getByRole("tab").nth(1))
			.toHaveAttribute("aria-selected", "true");
	});

	test("scrolls to a tab's pane when it is clicked", async () => {
		const screen = await renderColumns(NARROW_WIDTH);

		await userEvent.click(screen.getByRole("tab").nth(2));

		await waitUntilPaneInView("own");
		await expect
			.element(screen.getByRole("tab").nth(2))
			.toHaveAttribute("aria-selected", "true");
	});

	test("keeps the clicked tab selected while scrolling past the panes in between", async () => {
		const screen = await renderColumns(NARROW_WIDTH);
		const selectedTabs = recordSelectedTabs();

		await userEvent.click(screen.getByRole("tab").nth(2));
		await waitUntilPaneInView("own");

		expect(new Set(selectedTabs)).toEqual(
			new Set([screen.getByRole("tab").nth(2).element().textContent]),
		);
	});

	test("keeps a card fading out of a pane out of view from widening the page", async () => {
		const screen = await renderInRouter(<ColumnsWithRemovableReceivedCard />);
		const pageWidth = document.documentElement.scrollWidth;

		await userEvent.click(screen.getByRole("button", { name: "Remove" }));

		expect(document.documentElement.scrollWidth).toBe(pageWidth);
	});

	test("hands the tabs back to the scroll position when a swipe interrupts a tab click's scroll", async () => {
		const screen = await renderColumns(NARROW_WIDTH);
		const strip = pane("groups").closest<HTMLElement>("[class*='strip']")!;

		await userEvent.click(screen.getByRole("tab").nth(2));
		await vi.waitFor(() => {
			expect(strip.scrollLeft).toBeGreaterThan(0);
		}, 3000);
		strip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
		strip.scrollTo({ left: 0, behavior: "instant" });

		await expect
			.element(screen.getByRole("tab").nth(0))
			.toHaveAttribute("aria-selected", "true");

		pane("received").scrollIntoView({ inline: "start", block: "nearest" });

		await expect
			.element(screen.getByRole("tab").nth(1))
			.toHaveAttribute("aria-selected", "true");
	});

	test("scrolls the page back up to the tabs when swiping to another pane from deep down a pane", async () => {
		const screen = await renderTallColumns();
		const tabs = screen.getByRole("tablist").element();
		window.scrollTo({ top: 2000, behavior: "instant" });

		const strip = pane("received").closest<HTMLElement>("[class*='strip']")!;
		strip.scrollTo({ left: strip.scrollWidth, behavior: "instant" });

		await vi.waitFor(() => {
			expect(tabs.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
		}, 3000);
	});

	test("waits for the finger to lift before scrolling the page back up", async () => {
		const screen = await renderTallColumns();
		const tabs = screen.getByRole("tablist").element();
		window.scrollTo({ top: 2000, behavior: "instant" });

		const strip = pane("received").closest<HTMLElement>("[class*='strip']")!;
		strip.dispatchEvent(new TouchEvent("touchstart", { bubbles: true }));
		strip.scrollTo({ left: strip.scrollWidth, behavior: "instant" });

		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(window.scrollY).toBe(2000);

		strip.dispatchEvent(new TouchEvent("touchend", { bubbles: true }));

		await vi.waitFor(() => {
			expect(tabs.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
		}, 3000);
	});

	test("leaves the page where it is when swiping to another pane with the tabs still in view", async () => {
		const screen = await renderInRouter(
			<div style={{ containerType: "inline-size", width: NARROW_WIDTH }}>
				<div style={{ height: 1000 }} />
				<LookingColumns
					flipKey={null}
					own={null}
					invited={null}
					available={<div style={{ height: 3000 }}>Available group</div>}
					availableCount={1}
					received={<div>Received group</div>}
					receivedCount={1}
				/>
			</div>,
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

		const strip = pane("received").closest<HTMLElement>("[class*='strip']")!;
		strip.scrollTo({ left: strip.scrollWidth, behavior: "instant" });

		const receivedTab = screen.getByRole("tab").nth(1).element();
		await vi.waitFor(() => {
			expect(receivedTab.getAttribute("aria-selected")).toBe("true");
		});
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(window.scrollY).toBe(partlyScrolledPastTabs);
	});
});
