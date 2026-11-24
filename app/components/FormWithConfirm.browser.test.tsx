import * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { FormWithConfirm } from "./FormWithConfirm";

function withRouter(element: React.ReactElement) {
	const router = createMemoryRouter([{ path: "*", element }], {
		initialEntries: ["/"],
	});
	return (
		<React.StrictMode>
			<RouterProvider router={router} />
		</React.StrictMode>
	);
}

describe("FormWithConfirm", () => {
	test("names the dialog after its heading", async () => {
		await render(
			withRouter(
				<FormWithConfirm dialogHeading="Delete the build?" onConfirm={() => {}}>
					<button type="button">Delete</button>
				</FormWithConfirm>,
			),
		);

		await page.getByRole("button", { name: "Delete" }).click();

		await expect
			.element(page.getByRole("dialog", { name: "Delete the build?" }))
			.toBeVisible();
	});

	test("returns the focus to the trigger after confirming", async () => {
		const onConfirm = vi.fn();
		await render(
			withRouter(
				<FormWithConfirm
					dialogHeading="Delete the build?"
					submitButtonText="Confirm"
					onConfirm={onConfirm}
				>
					<button type="button">Delete</button>
				</FormWithConfirm>,
			),
		);

		await page.getByRole("button", { name: "Delete" }).click();
		await page.getByRole("button", { name: "Confirm" }).click();

		expect(onConfirm).toHaveBeenCalledOnce();
		await expect
			.element(page.getByRole("button", { name: "Delete" }))
			.toHaveFocus();
	});
});
