import type { ComponentProps } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { MAX_WEAPONS } from "../comp-analyzer-constants";
import { SelectedWeapons } from "./SelectedWeapons";

const defaultProps: ComponentProps<typeof SelectedWeapons> = {
	selectedWeaponIds: [],
	onRemove: vi.fn(),
};

function renderSelectedWeapons(
	props: Partial<ComponentProps<typeof SelectedWeapons>> = {},
) {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <SelectedWeapons {...defaultProps} {...props} />,
			},
		],
		{ initialEntries: ["/"] },
	);

	return render(<RouterProvider router={router} />);
}

describe("SelectedWeapons", () => {
	describe("empty state", () => {
		test("renders empty slots when no weapons selected", async () => {
			const screen = await renderSelectedWeapons({ selectedWeaponIds: [] });

			const emptySlots = screen.container.querySelectorAll(
				'[class*="weaponNameEmpty"]',
			);
			expect(emptySlots.length).toBe(MAX_WEAPONS);
		});

		test("renders correct number of slots", async () => {
			const screen = await renderSelectedWeapons();

			const rows = screen.container.querySelectorAll(
				'[class*="selectedWeaponRow"]',
			);
			expect(rows.length).toBe(MAX_WEAPONS);
		});
	});

	describe("selected weapons", () => {
		test("renders selected weapon with name", async () => {
			const screen = await renderSelectedWeapons({
				selectedWeaponIds: [0],
			});

			await expect.element(screen.getByText("Sploosh-o-matic")).toBeVisible();
		});

		test("renders multiple selected weapons", async () => {
			const screen = await renderSelectedWeapons({
				selectedWeaponIds: [0, 10],
			});

			await expect.element(screen.getByText("Sploosh-o-matic")).toBeVisible();
			await expect.element(screen.getByText("Splattershot Jr.")).toBeVisible();
		});

		test("renders sub and special icons for selected weapon", async () => {
			const screen = await renderSelectedWeapons({
				selectedWeaponIds: [0],
			});

			const subSpecialContainers = screen.container.querySelectorAll(
				'[class*="subSpecialContainer"]',
			);
			const filledContainers = Array.from(subSpecialContainers).filter(
				(container) => !container.className.includes("Spacer"),
			);
			expect(filledContainers.length).toBeGreaterThan(0);

			const kitIcons = screen.container.querySelectorAll('[class*="kitIcon"]');
			expect(kitIcons.length).toBeGreaterThan(0);
		});

		test("shows empty slots for remaining positions", async () => {
			const screen = await renderSelectedWeapons({
				selectedWeaponIds: [0],
			});

			const emptySlots = screen.container.querySelectorAll(
				'[class*="weaponNameEmpty"]',
			);
			expect(emptySlots.length).toBe(MAX_WEAPONS - 1);
		});
	});

	describe("remove functionality", () => {
		test("renders remove button for selected weapons", async () => {
			const screen = await renderSelectedWeapons({
				selectedWeaponIds: [0],
			});

			const removeButton = screen.getByRole("button", {
				name: "Remove weapon",
			});
			await expect.element(removeButton).toBeVisible();
		});

		test("calls onRemove with correct index when remove button clicked", async () => {
			const onRemove = vi.fn();
			const screen = await renderSelectedWeapons({
				selectedWeaponIds: [0, 10],
				onRemove,
			});

			const removeButtons = screen.container.querySelectorAll(
				'[class*="removeButton"]',
			);
			(removeButtons[0] as HTMLElement).click();

			expect(onRemove).toHaveBeenCalledWith(0);
		});

		test("calls onRemove with second index when second remove button clicked", async () => {
			const onRemove = vi.fn();
			const screen = await renderSelectedWeapons({
				selectedWeaponIds: [0, 10],
				onRemove,
			});

			const removeButtons = screen.container.querySelectorAll(
				'[class*="removeButton"]',
			);
			(removeButtons[1] as HTMLElement).click();

			expect(onRemove).toHaveBeenCalledWith(1);
		});

		test("does not render remove button for empty slots", async () => {
			const screen = await renderSelectedWeapons({
				selectedWeaponIds: [],
			});

			const removeButtons = screen.container.querySelectorAll(
				'[class*="removeButton"]',
			);
			expect(removeButtons.length).toBe(0);
		});
	});
});
