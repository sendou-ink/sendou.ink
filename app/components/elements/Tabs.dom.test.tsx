import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
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

function renderTabs(props: React.ComponentProps<typeof Tabs> = {}) {
	const router = createMemoryRouter(
		[{ path: "*", element: <Tabs {...props} /> }],
		{ initialEntries: ["/"] },
	);
	return render(<RouterProvider router={router} />);
}

describe("SendouTabs", () => {
	test("selects the first tab and shows its panel without a default", async () => {
		renderTabs();

		expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		expect(screen.getByRole("tabpanel")).toHaveTextContent("Panel one");
	});

	test("horizontal tabs move with ArrowRight/ArrowLeft, wrapping around", async () => {
		renderTabs();

		screen.getByRole("tab", { name: "One" }).focus();
		await userEvent.keyboard("{ArrowRight}");

		expect(screen.getByRole("tab", { name: "Two" })).toHaveFocus();
		expect(screen.getByRole("tabpanel")).toHaveTextContent("Panel two");

		await userEvent.keyboard("{ArrowLeft}");
		await userEvent.keyboard("{ArrowLeft}");
		expect(screen.getByRole("tab", { name: "Three" })).toHaveFocus();

		await userEvent.keyboard("{ArrowDown}");
		expect(screen.getByRole("tab", { name: "Three" })).toHaveFocus();
	});

	test("vertical tabs move with ArrowDown/ArrowUp", async () => {
		renderTabs({ orientation: "vertical" });

		screen.getByRole("tab", { name: "One" }).focus();
		await userEvent.keyboard("{ArrowDown}");

		expect(screen.getByRole("tab", { name: "Two" })).toHaveFocus();

		await userEvent.keyboard("{ArrowRight}");
		expect(screen.getByRole("tab", { name: "Two" })).toHaveFocus();

		await userEvent.keyboard("{ArrowUp}");
		expect(screen.getByRole("tab", { name: "One" })).toHaveFocus();
	});

	test("Home and End jump to the first and last tab", async () => {
		renderTabs();

		screen.getByRole("tab", { name: "Two" }).focus();

		await userEvent.keyboard("{End}");
		expect(screen.getByRole("tab", { name: "Three" })).toHaveFocus();

		await userEvent.keyboard("{Home}");
		expect(screen.getByRole("tab", { name: "One" })).toHaveFocus();
	});

	test("link tabs and plain tabs form one roving group", async () => {
		renderTabs({ linkTabs: true });

		screen.getByRole("tab", { name: "One" }).focus();
		await userEvent.keyboard("{ArrowRight}");
		expect(screen.getByRole("tab", { name: "Two" })).toHaveFocus();

		await userEvent.keyboard("{ArrowRight}");
		expect(screen.getByRole("tab", { name: "Three" })).toHaveFocus();
		expect(screen.getByRole("tab", { name: "Three" })).toHaveAttribute(
			"tabindex",
			"0",
		);
	});
});
