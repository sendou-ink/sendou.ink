import clsx from "clsx";
import { X } from "lucide-react";
import * as React from "react";
import { createPortal, flushSync } from "react-dom";
import { useNavigate } from "react-router";
import {
	SendouButton,
	type SendouButtonProps,
} from "~/components/elements/Button";
import { useHydrated } from "~/hooks/useHydrated";
import styles from "./Dialog.module.css";

interface DialogElementProps {
	id?: string;
	className?: string;
	isDismissable?: boolean;
	onClose?: () => void;
	"aria-label"?: string;
	"aria-labelledby"?: string;
	children: React.ReactNode;
	ref?: React.Ref<HTMLDialogElement>;
}

/**
 * Unstyled native `<dialog>` shell: shows itself modally on mount, closes on
 * Escape (and outside clicks when `isDismissable`) and reports every close
 * through `onClose`. The caller owns visibility by mounting/unmounting it.
 * Focus lands on the dialog itself rather than its first control.
 *
 * Portaled to `<body>` so a dialog holding a form can be rendered from inside
 * another form without nesting the `<form>` elements. Renders nothing on the
 * server.
 */
export function SendouModal({ ref, ...rest }: DialogElementProps) {
	const isHydrated = useHydrated();
	if (!isHydrated) return null;

	return createPortal(
		<DialogElement
			ref={(dialog) => {
				if (typeof ref === "function") {
					ref(dialog);
				} else if (ref) {
					ref.current = dialog;
				}
				if (dialog && !dialog.open) {
					dialog.showModal();
					dialog.focus();
				}
			}}
			{...rest}
		/>,
		document.body,
	);
}

function DialogElement({
	id,
	className,
	isDismissable,
	onClose,
	"aria-label": ariaLabel,
	"aria-labelledby": ariaLabelledby,
	children,
	ref,
}: DialogElementProps) {
	return (
		<dialog
			ref={ref}
			id={id}
			className={className}
			aria-label={ariaLabel}
			aria-labelledby={ariaLabelledby}
			tabIndex={-1}
			closedby={isDismissable ? "any" : "closerequest"}
			onClose={onClose}
			onClick={isDismissable ? closeOnBackdropClick : undefined}
		>
			{children}
		</dialog>
	);
}

// Safari 26 is missing `closedby`, close on backdrop clicks manually
function closeOnBackdropClick(event: React.MouseEvent<HTMLDialogElement>) {
	if (event.target !== event.currentTarget) return;
	const rect = event.currentTarget.getBoundingClientRect();
	const outside =
		event.clientX < rect.left ||
		event.clientX > rect.right ||
		event.clientY < rect.top ||
		event.clientY > rect.bottom;
	if (outside) {
		event.currentTarget.close();
	}
}

/** Invoker commands open and close the dialog natively; this guards the JS fallback for browsers without them. */
function supportsInvokerCommands() {
	return "commandForElement" in HTMLButtonElement.prototype;
}

interface SendouDialogProps {
	/**
	 * Button-like element that opens the dialog through `commandfor`. With a
	 * trigger the dialog is rendered in place, closed, so it opens even before
	 * hydration. Its content is remounted on every close.
	 */
	trigger?: React.ReactElement<
		Pick<SendouButtonProps, "onClick" | "commandfor" | "command">
	>;
	children?: React.ReactNode;
	heading?: string;
	showHeading?: boolean;
	onClose?: () => void;
	/** URL to navigate to on close */
	onCloseTo?: string;
	onOpenChange?: (isOpen: boolean) => void;
	isOpen?: boolean;
	/** Closing by clicking outside the dialog. */
	isDismissable?: boolean;
	className?: string;
	"aria-label"?: string;
	/** takes over the full screen, hiding the content below */
	isFullScreen?: boolean;
	/** show the close button even without onClose */
	showCloseButton?: boolean;
	/**
	 * Trigger mode: mount the content only while open, for content that is
	 * expensive or does work on mount. Costs the pre-hydration open.
	 */
	lazy?: boolean;
}

/**
 * Dialog that is open by default without a `trigger` (or controlled via `isOpen`), or opened by
 * the given `trigger` element.
 */
export function SendouDialog({
	trigger,
	lazy,
	children,
	...rest
}: SendouDialogProps) {
	if (trigger) {
		return (
			<TriggeredDialog trigger={trigger} lazy={lazy} {...rest}>
				{children}
			</TriggeredDialog>
		);
	}

	const props =
		typeof rest.isOpen === "boolean" ? rest : { ...rest, isOpen: true };
	return <PortaledDialog {...props}>{children}</PortaledDialog>;
}

type DialogChromeProps = Pick<
	SendouDialogProps,
	| "heading"
	| "showHeading"
	| "className"
	| "showCloseButton"
	| "isDismissable"
	| "isFullScreen"
	| "onClose"
	| "onCloseTo"
	| "aria-label"
>;

function TriggeredDialog({
	trigger,
	lazy,
	children,
	...chrome
}: DialogChromeProps & {
	trigger: NonNullable<SendouDialogProps["trigger"]>;
	lazy?: boolean;
	children?: React.ReactNode;
}) {
	const navigate = useNavigate();
	const dialogId = React.useId();
	const dialogRef = React.useRef<HTMLDialogElement>(null);
	const [open, setOpen] = React.useState(false);

	const [contentKey, remountContent] = React.useReducer(
		(key: number) => key + 1,
		0,
	);

	const handleClosed = () => {
		remountContent();
		if (chrome.onCloseTo) {
			navigate(chrome.onCloseTo);
		} else {
			chrome.onClose?.();
		}
	};

	// React wires `onToggle` on a hydrated <dialog> only when it is also a
	// popover, so opens are observed natively (also seeding from a dialog
	// opened before hydration). Lazy content is committed on `beforetoggle`,
	// which fires synchronously before the dialog shows, so it is in the
	// dialog's first painted frame rather than a frame behind it. Wired once
	// on mount: a ref callback would rerun on every render and, on an open
	// dialog, take the focus back from whatever inside it the user is typing in.
	React.useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;

		const handleOpened = () => {
			setOpen(true);
			dialog.focus();
		};
		const onBeforeToggle = (event: Event) => {
			if ((event as ToggleEvent).newState === "open") {
				flushSync(() => setOpen(true));
			}
		};
		const onToggle = (event: Event) => {
			if ((event as ToggleEvent).newState === "open") {
				handleOpened();
			} else {
				setOpen(false);
			}
		};
		dialog.addEventListener("beforetoggle", onBeforeToggle);
		dialog.addEventListener("toggle", onToggle);
		if (dialog.open) handleOpened();
		return () => {
			dialog.removeEventListener("beforetoggle", onBeforeToggle);
			dialog.removeEventListener("toggle", onToggle);
		};
	}, []);

	return (
		<>
			{React.cloneElement(trigger, {
				commandfor: dialogId,
				command: "show-modal",
				onClick: (event) => {
					trigger.props.onClick?.(event);
					if (!supportsInvokerCommands()) {
						dialogRef.current?.showModal();
					}
				},
			})}
			<DialogElement
				ref={dialogRef}
				id={dialogId}
				{...dialogElementProps(chrome, dialogId, handleClosed)}
			>
				<DialogChrome key={contentKey} {...chrome} dialogId={dialogId}>
					{lazy && !open ? null : children}
				</DialogChrome>
			</DialogElement>
		</>
	);
}

function PortaledDialog({
	children,
	isOpen,
	onOpenChange,
	...chrome
}: DialogChromeProps &
	Pick<SendouDialogProps, "isOpen" | "onOpenChange" | "children">) {
	const navigate = useNavigate();
	const dialogId = React.useId();

	const handleClosed = () => {
		if (onOpenChange) {
			onOpenChange(false);
		} else if (chrome.onCloseTo) {
			navigate(chrome.onCloseTo);
		} else {
			chrome.onClose?.();
		}
	};

	if (!isOpen) return null;

	return (
		<SendouModal
			id={dialogId}
			{...dialogElementProps(chrome, dialogId, handleClosed)}
		>
			<DialogChrome {...chrome} dialogId={dialogId}>
				{children}
			</DialogChrome>
		</SendouModal>
	);
}

function dialogElementProps(
	{
		className,
		isFullScreen,
		isDismissable,
		heading,
		"aria-label": ariaLabel,
	}: DialogChromeProps,
	dialogId: string,
	onClose: () => void,
) {
	return {
		className: clsx(className, styles.modal, "scrollbar", {
			[styles.fullScreenModal]: isFullScreen,
		}),
		isDismissable,
		onClose,
		"aria-label": ariaLabel,
		"aria-labelledby":
			!ariaLabel && heading ? headingIdFor(dialogId) : undefined,
	};
}

function headingIdFor(dialogId: string) {
	return `${dialogId}-heading`;
}

function DialogChrome({
	dialogId,
	heading,
	showHeading = true,
	showCloseButton,
	onClose,
	onCloseTo,
	children,
}: DialogChromeProps & { dialogId: string; children: React.ReactNode }) {
	if (!showHeading) return children;

	return (
		<>
			<div
				className={clsx(styles.headingContainer, {
					[styles.noHeading]: !heading,
				})}
			>
				{heading ? (
					<h2 id={headingIdFor(dialogId)} className={styles.heading}>
						{heading}
					</h2>
				) : null}
				{showCloseButton || onClose || onCloseTo ? (
					<SendouButton
						icon={<X />}
						shape="circle"
						variant="minimal-destructive"
						className="ml-auto"
						aria-label="Close"
						commandfor={dialogId}
						command="close"
						onClick={(event) => {
							if (!supportsInvokerCommands()) {
								event.currentTarget.closest("dialog")?.close();
							}
						}}
					/>
				) : null}
			</div>
			{children}
		</>
	);
}
