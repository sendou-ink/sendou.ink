import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { SendouPopover } from "./Popover";
import { SendouSelect, SendouSelectItem } from "./Select";

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
});
