import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { SendouToastRegion, toastQueue } from "./Toast";

function Wrapper() {
	return <SendouToastRegion />;
}

describe("Toast", () => {
	test("renders success toast", async () => {
		const screen = await render(<Wrapper />);

		toastQueue.add(
			{ message: "Operation completed", variant: "success" },
			{ timeout: 5000 },
		);

		await expect.element(screen.getByText("Operation completed")).toBeVisible();
	});

	test("renders error toast", async () => {
		const screen = await render(<Wrapper />);

		toastQueue.add({ message: "Something went wrong", variant: "error" });

		await expect
			.element(screen.getByText("Something went wrong"))
			.toBeVisible();
	});

	test("dismisses toast when close button is clicked", async () => {
		const screen = await render(<Wrapper />);

		toastQueue.add({ message: "Dismiss me", variant: "info" }, { timeout: 0 });

		const toast = screen.getByRole("alertdialog", { name: "Dismiss me" });
		await expect.element(toast).toBeVisible();

		await screen.getByLabelText("Close").first().click();

		await expect.element(toast).not.toBeInTheDocument();
	});
});
