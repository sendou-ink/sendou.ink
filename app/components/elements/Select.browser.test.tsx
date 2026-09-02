import { describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import {
	SendouSelect,
	SendouSelectItem,
	SendouSelectItemSection,
} from "./Select";

const SECTIONS = [
	{
		heading: "2023",
		key: "2023",
		items: [
			{ id: 2, name: "Season 2" },
			{ id: 1, name: "Season 1" },
			{ id: 0, name: "Season 0" },
		],
	},
];

function GroupedSelect(props: {
	search?: { placeholder?: string };
	selectedKey?: number;
}) {
	return (
		<SendouSelect
			label="Season"
			items={SECTIONS}
			search={props.search}
			selectedKey={props.selectedKey}
			placeholder="Pick a season"
		>
			{({ heading, items, key }: (typeof SECTIONS)[number]) => (
				<SendouSelectItemSection heading={heading} key={key}>
					{items.map((item) => (
						<SendouSelectItem key={item.id} id={item.id}>
							{item.name}
						</SendouSelectItem>
					))}
				</SendouSelectItemSection>
			)}
		</SendouSelect>
	);
}

describe("SendouSelect", () => {
	test("renders an item with a falsy (0) key when there is no search", async () => {
		const screen = await render(<GroupedSelect />);

		await screen.getByRole("button").click();

		await expect
			.element(screen.getByRole("option", { name: "Season 0" }))
			.toBeVisible();
	});

	test("filters items when search is enabled", async () => {
		const screen = await render(<GroupedSelect search={{}} />);

		await screen.getByRole("button").click();
		await screen.getByRole("combobox").fill("Season 1");

		await expect
			.element(screen.getByRole("option", { name: "Season 1" }))
			.toBeVisible();
		await expect
			.element(screen.getByRole("option", { name: "Season 2" }))
			.not.toBeInTheDocument();
	});

	test("shows the empty state when nothing matches the search", async () => {
		const screen = await render(<GroupedSelect search={{}} />);

		await screen.getByRole("button").click();
		await screen.getByRole("combobox").fill("nope");

		await expect.element(screen.getByText("No results")).toBeVisible();
		await expect
			.element(screen.getByRole("group", { name: "2023" }))
			.not.toBeInTheDocument();
	});

	test("mounts only the selected option while closed", async () => {
		const screen = await render(<GroupedSelect selectedKey={1} />);

		const options = () =>
			screen.container.querySelectorAll('[role="option"]').length;
		expect(options()).toBe(1);
		await expect
			.element(screen.getByRole("button"))
			.toHaveTextContent("Season 1");

		await screen.getByRole("button").click();
		await expect
			.element(screen.getByRole("option", { name: "Season 2" }))
			.toBeVisible();
		expect(options()).toBe(3);
	});

	test("tabbing out of the open listbox closes it", async () => {
		const screen = await render(
			<>
				<GroupedSelect />
				<button type="button">After</button>
			</>,
		);

		await screen.getByRole("button", { name: /Season/ }).click();
		await expect.element(screen.getByRole("listbox")).toBeVisible();

		await userEvent.keyboard("{Tab}");

		await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();
		await expect
			.element(screen.getByRole("button", { name: "After" }))
			.toHaveFocus();
	});

	test("hovering an option moves the active descendant to it", async () => {
		const screen = await render(<GroupedSelect />);

		await screen.getByRole("button").click();
		const option = screen.getByRole("option", { name: "Season 0" });
		await option.hover();

		await expect
			.element(screen.getByRole("listbox"))
			.toHaveAttribute("aria-activedescendant", (await option.element()).id);
	});
});
