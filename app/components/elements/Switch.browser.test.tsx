import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { SendouSwitch } from "./Switch";

function indicatorHeight(container: HTMLElement) {
	const indicator = container.querySelector("label > div");

	return indicator ? Number.parseFloat(getComputedStyle(indicator).height) : 0;
}

describe("SendouSwitch", () => {
	test("toggles when clicked", async () => {
		const screen = await render(
			<SendouSwitch aria-label="Stay as sub" data-testid="switch" />,
		);

		await expect.element(screen.getByRole("switch")).not.toBeChecked();

		await screen.getByTestId("switch").click();

		await expect.element(screen.getByRole("switch")).toBeChecked();
	});

	test("reports the new state to onChange", async () => {
		const onChange = vi.fn();
		const screen = await render(
			<SendouSwitch
				aria-label="Stay as sub"
				data-testid="switch"
				defaultSelected
				onChange={onChange}
			/>,
		);

		await screen.getByTestId("switch").click();

		expect(onChange).toHaveBeenCalledWith(false);
	});

	test("stays at the state given by isSelected when controlled", async () => {
		const screen = await render(
			<SendouSwitch
				aria-label="Stay as sub"
				data-testid="switch"
				isSelected={false}
				onChange={vi.fn()}
			/>,
		);

		await screen.getByTestId("switch").click();

		await expect.element(screen.getByRole("switch")).not.toBeChecked();
	});

	test("renders a smaller indicator with size small", async () => {
		const defaultSize = await render(<SendouSwitch aria-label="Default" />);
		const smallSize = await render(
			<SendouSwitch aria-label="Small" size="small" />,
		);

		expect(indicatorHeight(smallSize.container)).toBeLessThan(
			indicatorHeight(defaultSize.container),
		);
	});
});
