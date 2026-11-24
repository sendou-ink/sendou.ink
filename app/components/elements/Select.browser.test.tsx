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

	test("focuses the search input within the opening click", async () => {
		const screen = await render(<GroupedSelect search={{}} />);
		const trigger = screen.getByRole("button").element() as HTMLButtonElement;

		trigger.click();

		expect(document.activeElement).toBe(screen.getByRole("combobox").element());
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

	test("keeps the popover open when Enter has no match to commit", async () => {
		const screen = await render(<GroupedSelect search={{}} />);

		await screen.getByRole("button").click();
		await screen.getByRole("combobox").fill("Season 1");
		await expect
			.element(screen.getByRole("combobox"))
			.toHaveAttribute(
				"aria-activedescendant",
				(await screen.getByRole("option", { name: "Season 1" }).element()).id,
			);
		await screen.getByRole("combobox").fill("nope");
		await userEvent.keyboard("{Enter}");

		await expect.element(screen.getByRole("listbox")).toBeVisible();
		await expect
			.element(screen.getByRole("button", { name: /Season/ }))
			.toHaveTextContent("Pick a season");
	});

	test("commits the focused search result on Enter", async () => {
		const screen = await render(<GroupedSelect search={{}} />);

		await screen.getByRole("button").click();
		await screen.getByRole("combobox").fill("Season 1");
		await userEvent.keyboard("{Enter}");

		await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();
		await expect
			.element(screen.getByRole("button"))
			.toHaveTextContent("Season 1");
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

	test("type-ahead focuses the option matching what was typed", async () => {
		const screen = await render(<GroupedSelect />);

		await screen.getByRole("button").click();
		await expect.element(screen.getByRole("listbox")).toHaveFocus();
		await userEvent.keyboard("season 0");

		const option = screen.getByRole("option", { name: "Season 0" });
		await expect
			.element(screen.getByRole("listbox"))
			.toHaveAttribute("aria-activedescendant", (await option.element()).id);
	});

	test("repeating a type-ahead character cycles through the matches", async () => {
		const screen = await render(<GroupedSelect />);

		await screen.getByRole("button").click();
		await expect.element(screen.getByRole("listbox")).toHaveFocus();
		await userEvent.keyboard("ss");

		const option = screen.getByRole("option", { name: "Season 1" });
		await expect
			.element(screen.getByRole("listbox"))
			.toHaveAttribute("aria-activedescendant", (await option.element()).id);
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

	test.each([
		{
			why: "label and placeholder",
			props: { label: "Season" },
			name: "Season Placeholder",
		},
		{
			why: "label and pick",
			props: { label: "Season", selectedKey: 1 },
			name: "Season Season 1",
		},
		{
			why: "aria-label and placeholder",
			props: { "aria-label": "Pick a season" },
			name: "Pick a season Placeholder",
		},
		{
			why: "aria-label, placeholder repeating it left out",
			props: { "aria-label": "Placeholder" },
			name: "Placeholder",
		},
		{
			why: "aria-label and pick",
			props: { "aria-label": "Pick a season", selectedKey: 1 },
			name: "Pick a season Season 1",
		},
		{
			why: "outside label and pick",
			props: { "aria-labelledby": "outside-label", selectedKey: 1 },
			name: "Head Season 1",
		},
		{
			why: "no label, pick only",
			props: { selectedKey: 1 },
			name: "Season 1",
		},
	])("names the trigger from its $why", async ({ props, name }) => {
		const screen = await render(
			<>
				<span id="outside-label">Head</span>
				<SendouSelect
					items={SECTIONS[0].items}
					placeholder="Placeholder"
					{...props}
				>
					{(item) => (
						<SendouSelectItem key={item.id} id={item.id}>
							{item.name}
						</SendouSelectItem>
					)}
				</SendouSelect>
			</>,
		);

		await expect.element(screen.getByRole("button")).toHaveAccessibleName(name);
	});

	test("ties the trigger to the field's error text", async () => {
		const screen = await render(
			<>
				<div id="season-error">Pick a season first</div>
				<SendouSelect
					label="Season"
					items={SECTIONS[0].items}
					aria-describedby="season-error"
					aria-invalid="true"
				>
					{(item) => (
						<SendouSelectItem key={item.id} id={item.id}>
							{item.name}
						</SendouSelectItem>
					)}
				</SendouSelect>
			</>,
		);

		const trigger = screen.getByRole("button", { name: "Season" });
		await expect
			.element(trigger)
			.toHaveAccessibleDescription("Pick a season first");
		await expect.element(trigger).toHaveAttribute("aria-invalid", "true");
	});
});
