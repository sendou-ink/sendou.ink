import * as React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import invariant from "~/utils/invariant";
import { useCloseOnScrollClip } from "./useCloseOnScrollClip";

const PAGE_HEIGHT = 5000;

afterEach(() => {
	window.scrollTo(0, 0);
});

function Overlay({
	top,
	height,
	close,
}: {
	top: number;
	height: number;
	close: () => void;
}) {
	const ref = React.useRef<HTMLDivElement>(null);
	useCloseOnScrollClip(true, ref, close);

	return (
		<>
			<div style={{ height: PAGE_HEIGHT }} />
			<div
				ref={ref}
				style={{ position: "absolute", top, left: 0, width: 100, height }}
			/>
		</>
	);
}

function ScrollingOverlay({
	height,
	close,
}: {
	height: number;
	close: () => void;
}) {
	const ref = React.useRef<HTMLDivElement>(null);
	useCloseOnScrollClip(true, ref, close);

	return (
		<>
			<div style={{ height: PAGE_HEIGHT }} />
			<div
				ref={ref}
				data-testid="scroller"
				style={{
					position: "absolute",
					top: 200,
					left: 0,
					width: 100,
					height,
					overflowY: "auto",
				}}
			>
				<div style={{ height: 1000 }} />
			</div>
		</>
	);
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

describe("useCloseOnScrollClip", () => {
	test("closes once scrolling clips a popover that was fully visible", async () => {
		const close = vi.fn();
		await render(<Overlay top={200} height={100} close={close} />);
		await settle();
		expect(close).not.toHaveBeenCalled();

		window.scrollTo(0, 250);

		await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
	});

	test("never closes a popover too tall to have been fully visible", async () => {
		const close = vi.fn();
		await render(<Overlay top={0} height={PAGE_HEIGHT * 2} close={close} />);
		await settle();

		window.scrollTo(0, 250);
		await settle();

		expect(close).not.toHaveBeenCalled();
	});

	test("does not close a popover that was already clipped when it opened", async () => {
		const close = vi.fn();
		await render(<Overlay top={-50} height={100} close={close} />);
		await settle();

		window.scrollTo(0, 250);
		await settle();

		expect(close).not.toHaveBeenCalled();
	});

	test("never closes over a scroll of the popover's own content", async () => {
		const close = vi.fn();
		const screen = await render(
			<ScrollingOverlay height={100} close={close} />,
		);
		await settle();

		const scroller = document.querySelector<HTMLElement>(
			'[data-testid="scroller"]',
		);
		invariant(scroller);
		scroller.scrollTop = 500;
		await settle();

		// the content growing then clips it, which alone must never close
		screen.rerender(<ScrollingOverlay height={PAGE_HEIGHT} close={close} />);
		await settle();

		expect(close).not.toHaveBeenCalled();
	});
});
