import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type * as ObsWebSocket from "~/features/broadcast/core/ObsWebSocket";
import { FormField } from "~/form/FormField";
import { SendouForm, useFormValue } from "~/form/SendouForm";
import { broadcastObsAudioFormSchema } from "../broadcast-cast-schemas";
import { ObsCaptureCardField } from "./ObsCaptureCardField";

const obs = vi.hoisted(() => ({
	result: {
		type: "unreachable",
	} as ObsWebSocket.ListCaptureCardSourcesResult,
	calls: [] as Array<{ port: number; password: string | null }>,
	/** Set to answer each read by hand, through `answers`, instead of with `result` right away. */
	isAnsweredByHand: false,
	answers: [] as Array<
		(result: ObsWebSocket.ListCaptureCardSourcesResult) => void
	>,
}));

vi.mock("~/features/broadcast/core/ObsWebSocket", () => ({
	listCaptureCardSources: async (args: {
		port: number;
		password: string | null;
	}) => {
		obs.calls.push(args);
		if (!obs.isAnsweredByHand) return obs.result;

		return new Promise<ObsWebSocket.ListCaptureCardSourcesResult>((resolve) =>
			obs.answers.push(resolve),
		);
	},
}));

vi.mock("react-router", async () => {
	const actual = await vi.importActual("react-router");
	return {
		...actual,
		useFetcher: () => ({ data: undefined, state: "idle", submit: vi.fn() }),
	};
});

beforeEach(() => {
	obs.calls.length = 0;
	obs.result = { type: "unreachable" };
	obs.isAnsweredByHand = false;
	obs.answers.length = 0;
});

describe("ObsCaptureCardField", () => {
	test("loads the sources with the port and password in the form", async () => {
		await renderField({ port: 4466, password: "pw" });

		await vi.waitFor(() =>
			expect(obs.calls).toEqual([{ port: 4466, password: "pw" }]),
		);
	});

	test("loads the sources again once the password stops changing", async () => {
		const screen = await renderField();
		await vi.waitFor(() => expect(obs.calls).toHaveLength(1));

		await screen
			.getByRole("textbox", { name: "WebSocket server password" })
			.fill("secret");

		await vi.waitFor(() =>
			expect(obs.calls).toEqual([
				{ port: 4455, password: null },
				{ port: 4455, password: "secret" },
			]),
		);
	});

	test("ignores an older read answering after a newer one", async () => {
		obs.isAnsweredByHand = true;
		const screen = await renderField();
		await vi.waitFor(() => expect(obs.answers).toHaveLength(1));
		await screen
			.getByRole("textbox", { name: "WebSocket server password" })
			.fill("secret");
		await vi.waitFor(() => expect(obs.answers).toHaveLength(2));

		obs.answers[1]({ type: "sources", names: ["Elgato HD60"] });
		await expect
			.element(screen.getByRole("combobox", { name: "Capture card source" }))
			.toBeVisible();
		obs.answers[0]({ type: "wrong-password" });
		// lets the older answer render, if it were let through
		await new Promise((resolve) => setTimeout(resolve, 100));

		await expect
			.element(screen.getByRole("combobox", { name: "Capture card source" }))
			.toBeVisible();
		await expect
			.element(screen.getByText(/accept the password/))
			.not.toBeInTheDocument();
	});

	test("picks the capture card from the loaded sources", async () => {
		obs.result = { type: "sources", names: ["Elgato HD60", "Card audio"] };
		const screen = await renderField();

		await screen
			.getByRole("combobox", { name: "Capture card source" })
			.selectOptions("Card audio");

		await expect
			.element(screen.getByTestId("input-name"))
			.toHaveTextContent("Card audio");
	});

	test("keeps the saved source as an option when OBS doesn't have it", async () => {
		obs.result = { type: "sources", names: ["Elgato HD60"] };
		const screen = await renderField({ inputName: "Old card" });

		await expect
			.element(screen.getByRole("combobox", { name: "Capture card source" }))
			.toHaveValue("Old card");
	});

	test.each([
		{
			why: "OBS isn't reachable",
			result: { type: "unreachable" },
			message: /reach OBS/,
		},
		{
			why: "the password is wrong",
			result: { type: "wrong-password" },
			message: /accept the password/,
		},
		{
			why: "OBS has no sources",
			result: { type: "sources", names: [] },
			message: /no sources yet/,
		},
	] satisfies Array<{
		why: string;
		result: ObsWebSocket.ListCaptureCardSourcesResult;
		message: RegExp;
	}>)(
		"stays a text field telling why when $why",
		async ({ result, message }) => {
			obs.result = result;
			const screen = await renderField();

			await expect.element(screen.getByText(message)).toBeVisible();
			await expect
				.element(screen.getByRole("textbox", { name: "Capture card source" }))
				.toBeVisible();
		},
	);
});

function renderField(
	defaults: {
		port?: number;
		password?: string | null;
		inputName?: string | null;
	} = {},
) {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: (
					<SendouForm
						schema={broadcastObsAudioFormSchema}
						defaultValues={{
							port: defaults.port ?? 4455,
							password: defaults.password ?? null,
							inputName: defaults.inputName ?? null,
						}}
					>
						<FormField name="port" />
						<FormField name="password" />
						<ObsCaptureCardField />
						<InputNameValue />
					</SendouForm>
				),
			},
		],
		{ initialEntries: ["/"] },
	);

	return render(<RouterProvider router={router} />);
}

function InputNameValue() {
	return (
		<span data-testid="input-name">{String(useFormValue("inputName"))}</span>
	);
}
