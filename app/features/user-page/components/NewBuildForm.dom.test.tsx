import { beforeEach, describe, expect, test, vi } from "bun:test";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import * as ReactRouter from "react-router";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { BuildAbilitiesTupleWithUnknown } from "~/modules/in-game-lists/types";
import { NewBuildForm } from "./NewBuildForm";

let mockFetcherData: { fieldErrors?: Record<string, string> } | undefined;

vi.mock("react-router", () => {
	return {
		...ReactRouter,
		useFetcher: () => ({
			get data() {
				return mockFetcherData;
			},
			state: "idle",
			submit: vi.fn(),
		}),
	};
});

function renderForm(options?: {
	defaultValues?: Record<string, unknown>;
	gearIdToAbilities?: Record<string, BuildAbilitiesTupleWithUnknown[number]>;
	isEditing?: boolean;
}) {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: (
					<NewBuildForm
						defaultValues={options?.defaultValues}
						gearIdToAbilities={options?.gearIdToAbilities ?? {}}
						isEditing={options?.isEditing}
					/>
				),
			},
		],
		{ initialEntries: ["/"] },
	);

	return render(<RouterProvider router={router} />);
}

const GEAR_ERROR_MESSAGE = "Fill all gear slots or leave all empty";

describe("NewBuildForm", () => {
	beforeEach(() => {
		mockFetcherData = undefined;
	});

	describe("gear validation - all or none", () => {
		test("shows error when only head gear is provided via default values", async () => {
			renderForm({
				defaultValues: {
					weapons: [{ id: 0, isFavorite: false }],
					title: "Test Build",
					head: 1,
					clothes: null,
					shoes: null,
					abilities: [
						["LDE", "ISM", "ISM", "ISM"],
						["NS", "SSU", "SSU", "SSU"],
						["SJ", "SRU", "SRU", "SRU"],
					],
				},
			});

			await userEvent.click(screen.getByRole("button", { name: "Submit" }));

			expect(await screen.findByText(GEAR_ERROR_MESSAGE)).toBeVisible();
		});

		test("shows error when head and clothes selected but not shoes", async () => {
			renderForm({
				defaultValues: {
					weapons: [{ id: 0, isFavorite: false }],
					title: "Test Build",
					head: 1,
					clothes: 1,
					shoes: null,
					abilities: [
						["LDE", "ISM", "ISM", "ISM"],
						["NS", "SSU", "SSU", "SSU"],
						["SJ", "SRU", "SRU", "SRU"],
					],
				},
			});

			await userEvent.click(screen.getByRole("button", { name: "Submit" }));

			expect(await screen.findByText(GEAR_ERROR_MESSAGE)).toBeVisible();
		});

		test("no gear error when all three gear pieces are selected", async () => {
			const { container } = renderForm({
				defaultValues: {
					weapons: [{ id: 0, isFavorite: false }],
					title: "Test Build",
					head: 1,
					clothes: 1,
					shoes: 1,
					abilities: [
						["LDE", "ISM", "ISM", "ISM"],
						["NS", "SSU", "SSU", "SSU"],
						["SJ", "SRU", "SRU", "SRU"],
					],
				},
			});

			await userEvent.click(screen.getByRole("button", { name: "Submit" }));

			const gearError = container.querySelector("#head-error");
			expect(gearError?.textContent?.includes(GEAR_ERROR_MESSAGE)).toBeFalsy();
		});

		test("no gear error when no gear is selected", async () => {
			const { container } = renderForm({
				defaultValues: {
					weapons: [{ id: 0, isFavorite: false }],
					title: "Test Build",
					head: null,
					clothes: null,
					shoes: null,
					abilities: [
						["LDE", "ISM", "ISM", "ISM"],
						["NS", "SSU", "SSU", "SSU"],
						["SJ", "SRU", "SRU", "SRU"],
					],
				},
			});

			await userEvent.click(screen.getByRole("button", { name: "Submit" }));

			const gearError = container.querySelector("#head-error");
			expect(gearError?.textContent?.includes(GEAR_ERROR_MESSAGE)).toBeFalsy();
		});
	});

	describe("abilities validation", () => {
		test("shows error when abilities contain UNKNOWN values", async () => {
			const { container } = renderForm({
				defaultValues: {
					weapons: [{ id: 0, isFavorite: false }],
					title: "Test Build",
				},
			});

			await userEvent.click(screen.getByRole("button", { name: "Submit" }));

			const abilitiesError = container.querySelector("#abilities-error");
			expect(abilitiesError?.textContent).toBe("This field is required");
		});

		test("no abilities error when all abilities are set", async () => {
			const { container } = renderForm({
				defaultValues: {
					weapons: [{ id: 0, isFavorite: false }],
					title: "Test Build",
					abilities: [
						["LDE", "ISM", "ISM", "ISM"],
						["NS", "SSU", "SSU", "SSU"],
						["SJ", "SRU", "SRU", "SRU"],
					],
				},
			});

			await userEvent.click(screen.getByRole("button", { name: "Submit" }));

			const abilitiesError = container.querySelector("#abilities-error");
			expect(abilitiesError?.textContent).toBeFalsy();
		});
	});
});
