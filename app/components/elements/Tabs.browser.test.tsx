import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { SendouTab, SendouTabList, SendouTabPanel, SendouTabs } from "./Tabs";

function Tabs({
	orientation,
	linkTabs,
}: {
	orientation?: "horizontal" | "vertical";
	linkTabs?: boolean;
}) {
	return (
		<SendouTabs orientation={orientation}>
			<SendouTabList>
				<SendouTab id="one" href={linkTabs ? "/one" : undefined}>
					One
				</SendouTab>
				<SendouTab id="two" href={linkTabs ? "/two" : undefined}>
					Two
				</SendouTab>
				<SendouTab id="three">Three</SendouTab>
			</SendouTabList>
			<SendouTabPanel id="one">Panel one</SendouTabPanel>
			<SendouTabPanel id="two">Panel two</SendouTabPanel>
			<SendouTabPanel id="three">Panel three</SendouTabPanel>
		</SendouTabs>
	);
}

async function renderTabs(props: React.ComponentProps<typeof Tabs> = {}) {
	const router = createMemoryRouter(
		[{ path: "*", element: <Tabs {...props} /> }],
		{ initialEntries: ["/"] },
	);
	return render(<RouterProvider router={router} />);
}

describe("SendouTabs", () => {
	test("selects the first tab and shows its panel without a default", async () => {
		const screen = await renderTabs();

		await expect
			.element(screen.getByRole("tab", { name: "One" }))
			.toHaveAttribute("aria-selected", "true");
		await expect
			.element(screen.getByRole("tabpanel"))
			.toHaveTextContent("Panel one");
	});

	test("horizontal tabs move with ArrowRight/ArrowLeft, wrapping around", async () => {
		const screen = await renderTabs();

		(await screen.getByRole("tab", { name: "One" }).element()).focus();
		await userEvent.keyboard("{ArrowRight}");

		await expect
			.element(screen.getByRole("tab", { name: "Two" }))
			.toHaveFocus();
		await expect
			.element(screen.getByRole("tabpanel"))
			.toHaveTextContent("Panel two");

		await userEvent.keyboard("{ArrowLeft}");
		await userEvent.keyboard("{ArrowLeft}");
		await expect
			.element(screen.getByRole("tab", { name: "Three" }))
			.toHaveFocus();

		await userEvent.keyboard("{ArrowDown}");
		await expect
			.element(screen.getByRole("tab", { name: "Three" }))
			.toHaveFocus();
	});

	test("vertical tabs move with ArrowDown/ArrowUp", async () => {
		const screen = await renderTabs({ orientation: "vertical" });

		(await screen.getByRole("tab", { name: "One" }).element()).focus();
		await userEvent.keyboard("{ArrowDown}");

		await expect
			.element(screen.getByRole("tab", { name: "Two" }))
			.toHaveFocus();

		await userEvent.keyboard("{ArrowRight}");
		await expect
			.element(screen.getByRole("tab", { name: "Two" }))
			.toHaveFocus();

		await userEvent.keyboard("{ArrowUp}");
		await expect
			.element(screen.getByRole("tab", { name: "One" }))
			.toHaveFocus();
	});

	test("Home and End jump to the first and last tab", async () => {
		const screen = await renderTabs();

		(await screen.getByRole("tab", { name: "Two" }).element()).focus();

		await userEvent.keyboard("{End}");
		await expect
			.element(screen.getByRole("tab", { name: "Three" }))
			.toHaveFocus();

		await userEvent.keyboard("{Home}");
		await expect
			.element(screen.getByRole("tab", { name: "One" }))
			.toHaveFocus();
	});

	test("link tabs and plain tabs form one roving group", async () => {
		const screen = await renderTabs({ linkTabs: true });

		(await screen.getByRole("tab", { name: "One" }).element()).focus();
		await userEvent.keyboard("{ArrowRight}");
		await expect
			.element(screen.getByRole("tab", { name: "Two" }))
			.toHaveFocus();

		await userEvent.keyboard("{ArrowRight}");
		await expect
			.element(screen.getByRole("tab", { name: "Three" }))
			.toHaveFocus();
		await expect
			.element(screen.getByRole("tab", { name: "Three" }))
			.toHaveAttribute("tabindex", "0");
	});
});
