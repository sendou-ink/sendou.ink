import type * as React from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { SendouDialog } from "./Dialog";

let cleanupFns: Array<() => void> = [];

afterEach(() => {
	for (const cleanup of cleanupFns) {
		cleanup();
	}
	cleanupFns = [];
});

function withRouter(element: React.ReactElement) {
	const router = createMemoryRouter([{ path: "*", element }], {
		initialEntries: ["/"],
	});
	return <RouterProvider router={router} />;
}

function openDialog() {
	const dialog = document.querySelector("dialog");
	if (!dialog) throw new Error("no dialog rendered");
	return dialog;
}

/** A press on the dialog element, the way one on its backdrop arrives; it starts where it ends unless `pressedAt` says otherwise. */
function clickDialogAt(
	dialog: HTMLDialogElement,
	x: number,
	y: number,
	{ pressedAt = { x, y } }: { pressedAt?: { x: number; y: number } } = {},
) {
	dialog.dispatchEvent(
		new PointerEvent("pointerdown", {
			bubbles: true,
			clientX: pressedAt.x,
			clientY: pressedAt.y,
		}),
	);
	dialog.dispatchEvent(
		new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }),
	);
}

describe("SendouDialog", () => {
	test("keeps a backdrop click from reaching the page underneath", async () => {
		const onClose = vi.fn();
		const onBehindClick = vi.fn();
		await render(
			withRouter(
				<>
					<button
						type="button"
						onClick={onBehindClick}
						style={{ position: "fixed", top: 0, left: 0 }}
					>
						Behind
					</button>
					<SendouDialog heading="Hello" isDismissable onClose={onClose}>
						Content
					</SendouDialog>
				</>,
			),
		);
		await expect.element(page.getByText("Content")).toBeVisible();

		// forced past the actionability check, as the backdrop covers the button;
		// the press then lands on the backdrop at the button's spot
		await userEvent.click(page.getByText("Behind"), { force: true });

		await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(onBehindClick).not.toHaveBeenCalled();
	});

	test("keeps a dismissable dialog open when a press starts inside its box and ends outside", async () => {
		const onClose = vi.fn();
		await render(
			withRouter(
				<SendouDialog heading="Hello" isDismissable onClose={onClose}>
					Content
				</SendouDialog>,
			),
		);
		await expect.element(page.getByText("Content")).toBeVisible();

		const dialog = openDialog();
		const rect = dialog.getBoundingClientRect();
		clickDialogAt(dialog, rect.right + 5, rect.bottom + 5, {
			pressedAt: { x: rect.left + 1, y: rect.top + 1 },
		});

		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(onClose).not.toHaveBeenCalled();
		expect(dialog.open).toBe(true);
	});

	test("closes a dismissable dialog on a backdrop click", async () => {
		const onClose = vi.fn();
		await render(
			withRouter(
				<SendouDialog heading="Hello" isDismissable onClose={onClose}>
					Content
				</SendouDialog>,
			),
		);
		await expect.element(page.getByText("Content")).toBeVisible();

		const dialog = openDialog();
		const rect = dialog.getBoundingClientRect();
		clickDialogAt(dialog, rect.right + 5, rect.bottom + 5);

		await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(dialog.open).toBe(false);
	});

	test("keeps a dismissable dialog open on a click inside its box", async () => {
		const onClose = vi.fn();
		await render(
			withRouter(
				<SendouDialog heading="Hello" isDismissable onClose={onClose}>
					Content
				</SendouDialog>,
			),
		);
		await expect.element(page.getByText("Content")).toBeVisible();

		const dialog = openDialog();
		const rect = dialog.getBoundingClientRect();
		clickDialogAt(dialog, rect.left + 1, rect.top + 1);

		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(onClose).not.toHaveBeenCalled();
		expect(dialog.open).toBe(true);
	});

	test("trigger opens the dialog and the close button closes it", async () => {
		const screen = await render(
			withRouter(
				<SendouDialog
					heading="Hello"
					trigger={<button type="button">Open</button>}
					showCloseButton
				>
					Content
				</SendouDialog>,
			),
		);

		await screen.getByRole("button", { name: "Open" }).click();
		await expect.element(screen.getByText("Content")).toBeVisible();

		await screen.getByRole("button", { name: "Close" }).click();
		await expect.element(screen.getByText("Content")).not.toBeVisible();
	});

	test("adopts a lazy dialog opened before hydration and mounts its content", async () => {
		const app = withRouter(
			<SendouDialog
				heading="Hello"
				trigger={<button type="button">Open</button>}
				lazy
			>
				Lazy content
			</SendouDialog>,
		);

		const container = document.createElement("div");
		container.innerHTML = renderToString(app);
		document.body.appendChild(container);
		cleanupFns.push(() => container.remove());
		expect(container.textContent).not.toContain("Lazy content");

		openDialog().showModal();
		const root = hydrateRoot(container, app);
		cleanupFns.push(() => root.unmount());

		await expect.element(page.getByText("Lazy content")).toBeVisible();
		expect(openDialog().open).toBe(true);
	});

	test("locks page scrolling while open without moving the page content", async () => {
		const content = document.createElement("div");
		content.style.height = "300vh";
		content.style.width = "100%";
		document.body.appendChild(content);
		cleanupFns.push(() => content.remove());

		const screen = await render(
			withRouter(
				<SendouDialog
					heading="Hello"
					trigger={<button type="button">Open</button>}
					showCloseButton
				>
					Content
				</SendouDialog>,
			),
		);
		// after the render, whose container shares the body's flex row with the probe
		const widthBefore = content.getBoundingClientRect().width;

		await screen.getByRole("button", { name: "Open" }).click();
		await expect.element(screen.getByText("Content")).toBeVisible();
		await vi.waitFor(() => expect(document.body.style.overflow).toBe("hidden"));
		expect(content.getBoundingClientRect().width).toBe(widthBefore);

		await screen.getByRole("button", { name: "Close" }).click();
		await vi.waitFor(() => expect(document.body.style.overflow).toBe(""));
		expect(document.body.style.paddingRight).toBe("");
		expect(content.getBoundingClientRect().width).toBe(widthBefore);
	});

	test("releases the scroll lock when an open dialog unmounts", async () => {
		const screen = await render(
			withRouter(
				<SendouDialog heading="Hello" onClose={() => {}}>
					Content
				</SendouDialog>,
			),
		);
		await expect.element(screen.getByText("Content")).toBeVisible();
		await vi.waitFor(() => expect(document.body.style.overflow).toBe("hidden"));

		await screen.unmount();
		await vi.waitFor(() => expect(document.body.style.overflow).toBe(""));
	});

	test("lets tall content take the visible height less the mobile margins", async () => {
		const { innerWidth, innerHeight } = window;
		await page.viewport(375, 667);

		try {
			await render(
				withRouter(
					<SendouDialog heading="Hello" onClose={() => {}}>
						<div style={{ height: 2000 }} />
					</SendouDialog>,
				),
			);
			await expect.element(page.getByRole("dialog")).toBeVisible();

			const dialog = openDialog();
			// the open animation scales the box, and the rect includes transforms
			await Promise.all(
				dialog.getAnimations().map((animation) => animation.finished),
			);
			const rect = dialog.getBoundingClientRect();
			const maxHeight = Number.parseFloat(getComputedStyle(dialog).maxHeight);

			expect(maxHeight).toBeGreaterThan(window.innerHeight * 0.9);
			expect(rect.height).toBeCloseTo(maxHeight, 0);
			expect(rect.top).toBeCloseTo((window.innerHeight - rect.height) / 2, 0);
		} finally {
			await page.viewport(innerWidth, innerHeight);
		}
	});

	test("focuses the dialog itself instead of the close button on open", async () => {
		await render(
			withRouter(
				<SendouDialog heading="Hello" onClose={() => {}}>
					<button type="button">Action</button>
				</SendouDialog>,
			),
		);
		await expect.element(page.getByText("Action")).toBeVisible();

		expect(document.activeElement).toBe(openDialog());
	});

	test("focuses the dialog itself when opened by its trigger", async () => {
		const screen = await render(
			withRouter(
				<SendouDialog
					heading="Hello"
					trigger={<button type="button">Open</button>}
					showCloseButton
				>
					Content
				</SendouDialog>,
			),
		);

		await screen.getByRole("button", { name: "Open" }).click();
		await expect.element(screen.getByText("Content")).toBeVisible();

		await vi.waitFor(() => expect(document.activeElement).toBe(openDialog()));
	});
});
