import type { ComponentProps } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { CustomPickBanFlow } from "~/db/tables";
import { CustomFlowBuilder } from "./CustomFlowBuilder";

const defaultProps: ComponentProps<typeof CustomFlowBuilder> = {
	value: null,
	onChange: vi.fn(),
};

function renderComponent(
	props: Partial<ComponentProps<typeof CustomFlowBuilder>> = {},
) {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <CustomFlowBuilder {...defaultProps} {...props} />,
			},
		],
		{ initialEntries: ["/"] },
	);

	return render(<RouterProvider router={router} />);
}

describe("CustomFlowBuilder", () => {
	describe("initial rendering", () => {
		test("renders all who-side palette chips", async () => {
			const screen = await renderComponent();

			await expect.element(screen.getByText("Team Alpha")).toBeVisible();
			await expect.element(screen.getByText("Team Bravo")).toBeVisible();
			await expect.element(screen.getByText("Higher Seed")).toBeVisible();
			await expect.element(screen.getByText("Lower Seed")).toBeVisible();
			await expect.element(screen.getByText("Winner")).toBeVisible();
			await expect.element(screen.getByText("Loser")).toBeVisible();
		});

		test("renders all action palette chips", async () => {
			const screen = await renderComponent();

			await expect.element(screen.getByText("Random legal map")).toBeVisible();
			await expect.element(screen.getByText("Pick (map)")).toBeVisible();
			await expect.element(screen.getByText("Ban (map)")).toBeVisible();
			await expect.element(screen.getByText("Pick (mode)")).toBeVisible();
			await expect.element(screen.getByText("Ban (mode)")).toBeVisible();
		});

		test("renders section tab headers", async () => {
			const screen = await renderComponent();

			await expect.element(screen.getByText("Before set")).toBeVisible();
			await expect.element(screen.getByText("After map")).toBeVisible();
		});

		test("renders Add step button", async () => {
			const screen = await renderComponent();

			await expect
				.element(screen.getByRole("button", { name: "Add step" }))
				.toBeVisible();
		});

		test("renders empty step placeholders for active section", async () => {
			const screen = await renderComponent();

			const whoPlaceholders = screen.container.querySelectorAll(
				'[class*="dropZoneWho"]',
			);
			const actionPlaceholders = screen.container.querySelectorAll(
				'[class*="dropZoneAction"]',
			);

			expect(whoPlaceholders.length).toBe(1);
			expect(actionPlaceholders.length).toBe(1);
		});

		test("does not call onChange on mount", async () => {
			const onChange = vi.fn();
			await renderComponent({ onChange });

			expect(onChange).not.toHaveBeenCalled();
		});
	});

	describe("add step", () => {
		test("clicking Add step adds a new step row", async () => {
			const screen = await renderComponent();

			await screen.getByRole("button", { name: "Add step" }).click();

			const stepRows = screen.container.querySelectorAll('[class*="stepRow"]');
			expect(stepRows.length).toBe(2);
		});

		test("adding step calls onChange with null", async () => {
			const onChange = vi.fn();
			const screen = await renderComponent({ onChange });

			await screen.getByRole("button", { name: "Add step" }).click();

			expect(onChange).toHaveBeenCalledWith(null);
		});
	});

	describe("remove step", () => {
		test("remove button is hidden when section has only one step", async () => {
			const screen = await renderComponent();

			const removeButtons = screen.container.querySelectorAll(
				'[class*="removeButton"]',
			);

			for (const btn of removeButtons) {
				expect(btn.className).toContain("removeButtonHidden");
			}
		});

		test("clicking remove reduces step count back to one", async () => {
			const screen = await renderComponent();

			await screen.getByRole("button", { name: "Add step" }).click();

			let stepRows = screen.container.querySelectorAll('[class*="stepRow"]');
			expect(stepRows.length).toBe(2);

			await screen.getByLabelText("Remove step").first().click();

			stepRows = screen.container.querySelectorAll('[class*="stepRow"]');
			expect(stepRows.length).toBe(1);
		});

		test("remove button becomes hidden after removing down to one step", async () => {
			const screen = await renderComponent();

			await screen.getByRole("button", { name: "Add step" }).click();

			await screen.getByLabelText("Remove step").first().click();

			const removeButtons = screen.container.querySelectorAll(
				'[aria-label="Remove step"]',
			);
			for (const btn of removeButtons) {
				expect(btn.className).toContain("removeButtonHidden");
			}
		});
	});

	describe("pre-populated value", () => {
		test("renders filled drop zones from value prop", async () => {
			const value: CustomPickBanFlow = {
				preSet: [
					{ action: "BAN", side: "HIGHER_SEED" },
					{ action: "PICK", side: "LOWER_SEED" },
				],
				postGame: [{ action: "PICK", side: "WINNER" }],
			};

			const screen = await renderComponent({ value });

			const filledDropZones = screen.container.querySelectorAll(
				'[class*="dropZoneFilled"]',
			);
			const filledTexts = Array.from(filledDropZones).map(
				(el) => el.textContent,
			);

			expect(filledTexts).toContain("Higher Seed");
			expect(filledTexts).toContain("Ban (map)");
			expect(filledTexts).toContain("Lower Seed");
			expect(filledTexts).toContain("Pick (map)");
		});

		test("ROLL steps do not render who drop zone", async () => {
			const value: CustomPickBanFlow = {
				preSet: [{ action: "ROLL" }],
				postGame: [{ action: "PICK", side: "ALPHA" }],
			};

			const screen = await renderComponent({ value });

			const filledDropZones = screen.container.querySelectorAll(
				'[class*="dropZoneFilled"]',
			);
			const filledTexts = Array.from(filledDropZones).map(
				(el) => el.textContent,
			);
			expect(filledTexts).toContain("Random legal map");

			const whoDropZones = screen.container.querySelectorAll(
				'[class*="dropZoneWho"]',
			);
			expect(whoDropZones.length).toBe(0);
		});

		test("does not call onChange on mount with complete value", async () => {
			const onChange = vi.fn();
			const value: CustomPickBanFlow = {
				preSet: [{ action: "PICK", side: "HIGHER_SEED" }],
				postGame: [{ action: "PICK", side: "WINNER" }],
			};

			await renderComponent({ value, onChange });

			expect(onChange).not.toHaveBeenCalled();
		});
	});

	describe("validation errors", () => {
		test("shows missing action error for empty steps", async () => {
			const screen = await renderComponent();

			await expect
				.element(screen.getByText("Every step must have an action"))
				.toBeVisible();
		});

		test("shows no validation errors for complete valid flow", async () => {
			const value: CustomPickBanFlow = {
				preSet: [{ action: "PICK", side: "HIGHER_SEED" }],
				postGame: [{ action: "PICK", side: "WINNER" }],
			};

			const screen = await renderComponent({ value });

			const errors = screen.container.querySelectorAll(
				'[class*="validationError"]',
			);
			expect(errors.length).toBe(0);
		});

		test("shows last step must be pick or roll error", async () => {
			const value: CustomPickBanFlow = {
				preSet: [{ action: "BAN", side: "HIGHER_SEED" }],
				postGame: [{ action: "PICK", side: "WINNER" }],
			};

			const screen = await renderComponent({ value });

			await expect
				.element(
					screen.getByText(
						"Last step must be Pick or Roll (to determine the map)",
					),
				)
				.toBeVisible();
		});

		test("shows too many map picks error", async () => {
			const value: CustomPickBanFlow = {
				preSet: [
					{ action: "PICK", side: "HIGHER_SEED" },
					{ action: "PICK", side: "LOWER_SEED" },
				],
				postGame: [{ action: "PICK", side: "WINNER" }],
			};

			const screen = await renderComponent({ value });

			await expect
				.element(screen.getByText("At most one Pick or Roll per section"))
				.toBeVisible();
		});
	});
});
