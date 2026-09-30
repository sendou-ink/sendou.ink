import { describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { SendouMenu, SendouMenuItem } from "./Menu";

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

/** Opens the menu and waits for the focus it takes on the next frame. */
async function openMenu(screen: Awaited<ReturnType<typeof render>>) {
	await screen.getByRole("button", { name: "Open" }).click();
	const menu = await screen.getByRole("menu").element();
	await vi.waitFor(() =>
		expect(document.activeElement?.contains(menu)).toBe(true),
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
