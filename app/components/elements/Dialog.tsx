import clsx from "clsx";
import { X } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
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
	/** When closing the modal which URL to navigate to */
	onCloseTo?: string;
	onOpenChange?: (isOpen: boolean) => void;
	isOpen?: boolean;
	/** Closing by clicking outside the dialog. */
	isDismissable?: boolean;
	className?: string;
	"aria-label"?: string;
	/** If true, the modal takes over the full screen with the content below hidden */
	isFullScreen?: boolean;
	/** If true, shows the close button even if onClose is not provided */
	showCloseButton?: boolean;
	/**
	 * Trigger mode: mount the content only while open, for content that is
	 * expensive or does work on mount. Costs the pre-hydration open.
	 */
	lazy?: boolean;
}

/**
 * This component allows you to create a modal dialog with a customizable
 * trigger and content, rendered through the native `<dialog>` element.
 * It supports both controlled and uncontrolled modes for managing the
 * dialog's open state.
 *
 * @example
 * // Example usage with implicit isOpen
 * return (
 *   <SendouDialog
 *     heading="Dialog Title"
 *     onCloseTo={previousPageUrl()}
 *   >
 *     This is the dialog content.
 *   </SendouDialog>
 * );
 *
 * @example
 * // Example usage with a SendouButton as the trigger
 * return (
 *   <SendouDialog
 *     heading="Dialog Title"
 *     trigger={<SendouButton>Open Dialog</SendouButton>}
 *   >
 *     This is the dialog content.
 *   </SendouDialog>
 * );
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
	// popover, so the open state listens natively (and seeds from a dialog
	// opened before hydration)
	const trackOpenState = (dialog: HTMLDialogElement) => {
		const onToggle = (event: Event) =>
			setOpen((event as ToggleEvent).newState === "open");
		dialog.addEventListener("toggle", onToggle);
		if (dialog.open) setOpen(true);
		return () => dialog.removeEventListener("toggle", onToggle);
	};

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
				ref={(dialog) => {
					dialogRef.current = dialog;
					return dialog && lazy ? trackOpenState(dialog) : undefined;
				}}
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
