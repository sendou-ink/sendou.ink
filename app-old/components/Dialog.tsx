import React from "react";
import invariant from "~/utils/invariant";

// TODO: use react aria components

export function Dialog({
	children,
	isOpen,
	close,
	className,
	closeOnAnyClick,
}: {
	children: React.ReactNode;
	isOpen: boolean;
	close?: () => void;
	className?: string;
	closeOnAnyClick?: boolean;
}) {
	const ref = useDOMSync(isOpen);
	useControlledEsc({ ref, isOpen, close });

	// https://stackoverflow.com/a/26984690
	const closeOnOutsideClick = close
		? (event: React.MouseEvent<HTMLDialogElement, MouseEvent>) => {
				if (closeOnAnyClick) return close();
				const rect: DOMRect = ref.current.getBoundingClientRect();

				// https://stackoverflow.com/a/77402711
				const isFirefoxSelectClick = event.clientY === 0 && event.clientX === 0;
				if (isFirefoxSelectClick) return;

				const isInDialog =
					rect.top <= event.clientY &&
					event.clientY <= rect.top + rect.height &&
					rect.left <= event.clientX &&
					event.clientX <= rect.left + rect.width;
				if (!isInDialog) {
					close();
				}
			}
		: undefined;

	return (
		<dialog className={className} ref={ref} onClick={closeOnOutsideClick}>
			{children}
		</dialog>
	);
}

function useDOMSync(isOpen: boolean) {
	const ref = React.useRef<any>(null);

	React.useEffect(() => {
		const dialog = ref.current;

		if (dialog.open && isOpen) return;
		if (!dialog.open && !isOpen) return;

		const html = document.getElementsByTagName("html")[0];
		invariant(html);

		if (isOpen) {
			dialog.showModal();
			html.classList.add("lock-scroll");
		} else {
			dialog.close();
			html.classList.remove("lock-scroll");
		}

		return () => {
			dialog.close();
			html.classList.remove("lock-scroll");
		};
	}, [isOpen]);

	return ref;
}

function useControlledEsc({
	ref,
	isOpen,
	close,
}: {
	ref: React.MutableRefObject<any>;
	isOpen: boolean;
	close?: () => void;
}) {
	React.useEffect(() => {
		const dialog = ref.current;
		if (!dialog) return;

		const preventDefault = (event: KeyboardEvent) => {
			event.preventDefault();
		};
		dialog.addEventListener("cancel", preventDefault);

		return () => {
			dialog.removeEventListener("cancel", preventDefault);
		};
	}, [ref]);

	React.useEffect(() => {
		if (!isOpen || !close) return;

		const closeOnEsc = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				close();
			}
		};

		document.addEventListener("keydown", closeOnEsc);
		return () => document.removeEventListener("keydown", closeOnEsc);
	}, [isOpen, close]);
}
