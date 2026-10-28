import { describe, expect, test, vi } from "bun:test";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { SendouButton } from "./Button";

describe("SendouButton", () => {
	test("keeps its accessible name and focus while pending", () => {
		render(<SendouButton isPending>Save</SendouButton>);

		const button = screen.getByRole("button", { name: "Save" });
		expect(button).toHaveAttribute("aria-busy", "true");

		button.focus();
		expect(document.activeElement).toBe(button);
	});

	test("ignores clicks while pending", async () => {
		const onClick = vi.fn();
		render(
			<SendouButton isPending onClick={onClick}>
				Save
			</SendouButton>,
		);

		await userEvent.click(screen.getByRole("button"), {
			pointerEventsCheck: 0,
		});

		expect(onClick).not.toHaveBeenCalled();
	});
});
