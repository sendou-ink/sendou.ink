import { describe, expect, test } from "vitest";
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

function GroupedSelect(props: { search?: { placeholder?: string } }) {
	return (
		<SendouSelect label="Season" items={SECTIONS} search={props.search}>
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
		await screen.getByRole("searchbox").fill("Season 1");

		await expect
			.element(screen.getByRole("option", { name: "Season 1" }))
			.toBeVisible();
		await expect
			.element(screen.getByRole("option", { name: "Season 2" }))
			.not.toBeInTheDocument();
	});
});
