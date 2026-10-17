import { describe, expect, test, vi } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { MAX_WEAPONS } from "../comp-analyzer-constants";
import { SelectedWeapons } from "./SelectedWeapons";

const defaultProps: ComponentProps<typeof SelectedWeapons> = {
	selectedWeaponIds: [],
	onRemove: vi.fn(),
	onReorder: vi.fn(),
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
			const { container } = renderSelectedWeapons({ selectedWeaponIds: [] });

			const emptySlots = container.querySelectorAll(
				'[class*="weaponNameEmpty"]',
			);
			expect(emptySlots.length).toBe(MAX_WEAPONS);
		});

		test("renders correct number of slots", async () => {
			const { container } = renderSelectedWeapons();

			const rows = container.querySelectorAll('[class*="selectedWeaponRow"]');
			expect(rows.length).toBe(MAX_WEAPONS);
		});
	});

	describe("selected weapons", () => {
		test("renders selected weapon with name", async () => {
			renderSelectedWeapons({
				selectedWeaponIds: [0],
			});

			expect(screen.getByText("Sploosh-o-matic")).toBeVisible();
		});

		test("renders multiple selected weapons", async () => {
			renderSelectedWeapons({
				selectedWeaponIds: [0, 10],
			});

			expect(screen.getByText("Sploosh-o-matic")).toBeVisible();
			expect(screen.getByText("Splattershot Jr.")).toBeVisible();
		});

		test("renders sub and special icons for selected weapon", async () => {
			const { container } = renderSelectedWeapons({
				selectedWeaponIds: [0],
			});

			const subSpecialContainers = container.querySelectorAll(
				'[class*="subSpecialContainer"]',
			);
			const filledContainers = Array.from(subSpecialContainers).filter(
				(element) => !element.className.includes("Spacer"),
			);
			expect(filledContainers.length).toBeGreaterThan(0);

			const kitIcons = container.querySelectorAll('[class*="kitIcon"]');
			expect(kitIcons.length).toBeGreaterThan(0);
		});

		test("renders a row per copy when the same weapon is picked twice", async () => {
			const { container } = renderSelectedWeapons({
				selectedWeaponIds: [0, 0],
			});

			const rows = container.querySelectorAll(
				'[data-testid^="selected-weapon-"]',
			);
			expect(rows.length).toBe(2);

			const emptySlots = container.querySelectorAll(
				'[class*="weaponNameEmpty"]',
			);
			expect(emptySlots.length).toBe(MAX_WEAPONS - 2);
		});

		test("shows empty slots for remaining positions", async () => {
			const { container } = renderSelectedWeapons({
				selectedWeaponIds: [0],
			});

			const emptySlots = container.querySelectorAll(
				'[class*="weaponNameEmpty"]',
			);
			expect(emptySlots.length).toBe(MAX_WEAPONS - 1);
		});
	});

	describe("remove functionality", () => {
		test("renders remove button for selected weapons", async () => {
			renderSelectedWeapons({
				selectedWeaponIds: [0],
			});

			const removeButton = screen.getByTestId("remove-weapon-0");
			expect(removeButton).toBeVisible();
		});

		test("calls onRemove with correct index when remove button clicked", async () => {
			const onRemove = vi.fn();
			const { container } = renderSelectedWeapons({
				selectedWeaponIds: [0, 10],
				onRemove,
			});

			const removeButtons = container.querySelectorAll(
				'[class*="removeButton"]',
			);
			(removeButtons[0] as HTMLElement).click();

			expect(onRemove).toHaveBeenCalledWith(0);
		});

		test("calls onRemove with second index when second remove button clicked", async () => {
			const onRemove = vi.fn();
			const { container } = renderSelectedWeapons({
				selectedWeaponIds: [0, 10],
				onRemove,
			});

			const removeButtons = container.querySelectorAll(
				'[class*="removeButton"]',
			);
			(removeButtons[1] as HTMLElement).click();

			expect(onRemove).toHaveBeenCalledWith(1);
		});

		test("calls onRemove with the clicked index when the same weapon is picked twice", async () => {
			const onRemove = vi.fn();
			const { container } = renderSelectedWeapons({
				selectedWeaponIds: [0, 0],
				onRemove,
			});

			const removeButtons = container.querySelectorAll(
				'[class*="removeButton"]',
			);
			(removeButtons[1] as HTMLElement).click();

			expect(onRemove).toHaveBeenCalledWith(1);
		});

		test("does not render remove button for empty slots", async () => {
			const { container } = renderSelectedWeapons({
				selectedWeaponIds: [],
			});

			const removeButtons = container.querySelectorAll(
				'[class*="removeButton"]',
			);
			expect(removeButtons.length).toBe(0);
		});
	});
});
