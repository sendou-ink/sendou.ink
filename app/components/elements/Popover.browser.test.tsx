import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { SendouPopover } from "./Popover";
import { SendouSelect, SendouSelectItem } from "./Select";

let cleanupFns: Array<() => void> = [];

afterEach(() => {
	for (const cleanup of cleanupFns) {
		cleanup();
	}
	cleanupFns = [];
});

function PopoverWithSelect() {
	return (
		<SendouPopover trigger={<button type="button">Filters</button>}>
			<SendouSelect
				label="Season"
				items={[{ id: 1, name: "Season 1" }]}
				placeholder="Pick a season"
			>
				{({ id, name }: { id: number; name: string }) => (
					<SendouSelectItem key={id} id={id}>
						{name}
					</SendouSelectItem>
				)}
			</SendouSelect>
		</SendouPopover>
	);
}

describe("SendouPopover", () => {
	test("stays open when a select nested inside it is opened", async () => {
		const screen = await render(<PopoverWithSelect />);

		await screen.getByRole("button", { name: "Filters" }).click();
		await screen.getByRole("button", { name: /Pick a season/ }).click();

		await expect
			.element(screen.getByRole("option", { name: "Season 1" }))
			.toBeVisible();
	});

	test("tabbing out closes the popover", async () => {
		const screen = await render(
			<>
				<SendouPopover trigger={<button type="button">Open</button>}>
					<button type="button">Inside</button>
				</SendouPopover>
				<button type="button">After</button>
			</>,
		);

		await screen.getByRole("button", { name: "Open" }).click();
		await expect.element(screen.getByRole("dialog")).toBeVisible();

		await userEvent.keyboard("{Tab}");
		await expect
			.element(screen.getByRole("button", { name: "Inside" }))
			.toHaveFocus();
		await expect.element(screen.getByRole("dialog")).toBeVisible();

		await userEvent.keyboard("{Tab}");
		await expect
			.element(screen.getByRole("button", { name: "After" }))
			.toHaveFocus();
		await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
	});

	test("adopts a popover opened before hydration instead of closing it", async () => {
		const app = (
			<SendouPopover trigger={<button type="button">Open</button>}>
				Popover content
			</SendouPopover>
		);

		const container = document.createElement("div");
		container.innerHTML = renderToString(app);
		document.body.appendChild(container);
		cleanupFns.push(() => container.remove());

		const popover = container.querySelector<HTMLElement>("[popover]");
		if (!popover) throw new Error("no popover rendered");
		popover.showPopover();

		const root = hydrateRoot(container, app);
		cleanupFns.push(() => root.unmount());

		await expect.element(page.getByText("Popover content")).toBeVisible();
		expect(popover.matches(":popover-open")).toBe(true);
	});
});
