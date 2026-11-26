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

	test("keeps a card fading out of a pane out of view from widening the page", async () => {
		const screen = await renderInRouter(<ColumnsWithRemovableReceivedCard />);
		const pageWidth = document.documentElement.scrollWidth;

		await userEvent.click(screen.getByRole("button", { name: "Remove" }));

		expect(document.documentElement.scrollWidth).toBe(pageWidth);
	});
});
