import { describe, expect, test, vi } from "bun:test";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { SendouSwitch } from "./Switch";

describe("SendouSwitch", () => {
	test("toggles when clicked", async () => {
		render(<SendouSwitch aria-label="Stay as sub" data-testid="switch" />);

		expect(screen.getByRole("switch")).not.toBeChecked();

		await userEvent.click(screen.getByTestId("switch"));

		expect(screen.getByRole("switch")).toBeChecked();
	});

	test("reports the new state to onChange", async () => {
		const onChange = vi.fn();
		render(
			<SendouSwitch
				aria-label="Stay as sub"
				data-testid="switch"
				defaultSelected
				onChange={onChange}
			/>,
		);

		await userEvent.click(screen.getByTestId("switch"));

		expect(onChange).toHaveBeenCalledWith(false);
	});

	test("stays at the state given by isSelected when controlled", async () => {
		render(
			<SendouSwitch
				aria-label="Stay as sub"
				data-testid="switch"
				isSelected={false}
				onChange={vi.fn()}
			/>,
		);

		await userEvent.click(screen.getByTestId("switch"));

		expect(screen.getByRole("switch")).not.toBeChecked();
	});
});
