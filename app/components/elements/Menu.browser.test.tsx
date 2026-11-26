import * as React from "react";
import { describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { SendouContextMenu, SendouMenu, SendouMenuItem } from "./Menu";

function Menu({ onThird }: { onThird?: () => void }) {
	return (
		<>
			<SendouMenu trigger={<button type="button">Open</button>}>
				<SendouMenuItem>First</SendouMenuItem>
				<SendouMenuItem isDisabled>Second</SendouMenuItem>
				<SendouMenuItem onAction={onThird}>Third</SendouMenuItem>
			</SendouMenu>
			<button type="button">After</button>
		</>
	);
}

/** Opens the menu and waits for it to show and take focus on the next frame. */
async function openMenu(screen: Awaited<ReturnType<typeof render>>) {
	await screen.getByRole("button", { name: "Open" }).click();
	const menu = screen.getByRole("menu");
	await expect.element(menu).toBeVisible();
	await vi.waitFor(() =>
		expect(document.activeElement?.contains(menu.element())).toBe(true),
	);
}

describe("SendouMenu", () => {
	test("ArrowUp right after opening focuses the last item", async () => {
		const screen = await render(<Menu />);

		await openMenu(screen);
		await userEvent.keyboard("{ArrowUp}");

		await expect
			.element(screen.getByRole("menuitem", { name: "Third" }))
			.toHaveFocus();
	});

	test("ArrowDown cycles through the enabled items, skipping disabled ones", async () => {
		const screen = await render(<Menu />);

		await openMenu(screen);

		await userEvent.keyboard("{ArrowDown}");
		await expect
			.element(screen.getByRole("menuitem", { name: "First" }))
			.toHaveFocus();

		await userEvent.keyboard("{ArrowDown}");
		await expect
			.element(screen.getByRole("menuitem", { name: "Third" }))
			.toHaveFocus();

		await userEvent.keyboard("{ArrowDown}");
		await expect
			.element(screen.getByRole("menuitem", { name: "First" }))
			.toHaveFocus();
	});

	test("Home and End jump to the ends", async () => {
		const screen = await render(<Menu />);

		await openMenu(screen);

		await userEvent.keyboard("{End}");
		await expect
			.element(screen.getByRole("menuitem", { name: "Third" }))
			.toHaveFocus();

		await userEvent.keyboard("{Home}");
		await expect
			.element(screen.getByRole("menuitem", { name: "First" }))
			.toHaveFocus();
	});

	test("Escape closes the menu and returns focus to the trigger", async () => {
		const screen = await render(<Menu />);

		await openMenu(screen);

		await userEvent.keyboard("{ArrowDown}");
		await userEvent.keyboard("{Escape}");

		await expect.element(screen.getByRole("menu")).not.toBeInTheDocument();
		await expect
			.element(screen.getByRole("button", { name: "Open" }))
			.toHaveFocus();
	});

	test("tabbing out closes the menu", async () => {
		const screen = await render(<Menu />);

		await openMenu(screen);

		await userEvent.keyboard("{Tab}");

		await expect.element(screen.getByRole("menu")).not.toBeInTheDocument();
		await expect
			.element(screen.getByRole("button", { name: "After" }))
			.toHaveFocus();
	});

	test("Enter on a focused item runs its action and closes the menu", async () => {
		const onThird = vi.fn();
		const screen = await render(<Menu onThird={onThird} />);

		await openMenu(screen);

		await userEvent.keyboard("{End}");
		await userEvent.keyboard("{Enter}");

		expect(onThird).toHaveBeenCalledOnce();
		await expect.element(screen.getByRole("menu")).not.toBeInTheDocument();
	});
});

function ContextMenu({ onPick }: { onPick?: () => void }) {
	const [point, setPoint] = React.useState<{ x: number; y: number } | null>(
		null,
	);

	return (
		<>
			<button type="button" onClick={() => setPoint({ x: 200, y: 150 })}>
				Open
			</button>
			<button type="button">Outside</button>
			{point ? (
				<SendouContextMenu clientPoint={point} onClose={() => setPoint(null)}>
					<SendouMenuItem onAction={onPick}>Pick</SendouMenuItem>
					<SendouMenuItem>Other</SendouMenuItem>
				</SendouContextMenu>
			) : null}
		</>
	);
}

async function openContextMenu(screen: Awaited<ReturnType<typeof render>>) {
	await screen.getByRole("button", { name: "Open" }).click();
	const menu = screen.getByRole("menu");
	await expect.element(menu).toBeVisible();
	return menu;
}

describe("SendouContextMenu", () => {
	test("opens at the point with focus inside, arrow keys moving through the items", async () => {
		const screen = await render(<ContextMenu />);

		const menu = await openContextMenu(screen);

		const rect = menu.element().getBoundingClientRect();
		expect(Math.abs(rect.left - 200)).toBeLessThan(20);
		expect(Math.abs(rect.top - 150)).toBeLessThan(20);
		await userEvent.keyboard("{ArrowDown}");
		await expect
			.element(screen.getByRole("menuitem", { name: "Pick" }))
			.toHaveFocus();
	});

	test("picking an item runs its action and closes the menu", async () => {
		const onPick = vi.fn();
		const screen = await render(<ContextMenu onPick={onPick} />);

		await openContextMenu(screen);
		await screen.getByRole("menuitem", { name: "Pick" }).click();

		expect(onPick).toHaveBeenCalledOnce();
		await expect.element(screen.getByRole("menu")).not.toBeInTheDocument();
	});

	test("Escape closes the menu", async () => {
		const screen = await render(<ContextMenu />);

		await openContextMenu(screen);
		await userEvent.keyboard("{Escape}");

		await expect.element(screen.getByRole("menu")).not.toBeInTheDocument();
	});

	test("a press outside closes the menu", async () => {
		const screen = await render(<ContextMenu />);

		await openContextMenu(screen);
		await screen.getByRole("button", { name: "Outside" }).click();

		await expect.element(screen.getByRole("menu")).not.toBeInTheDocument();
	});
});
