import type { ModalOverlayProps } from "react-aria-components";
import {
	Dialog,
	DialogTrigger,
	Heading,
	ModalOverlay,
} from "react-aria-components";
import { Modal } from "react-aria-components";

import { useNavigate } from "@remix-run/react";
import clsx from "clsx";
import { SendouButton } from "~/components/elements/Button";
import { CrossIcon } from "~/components/icons/Cross";
import styles from "./Dialog.module.css";

interface SendouDialogProps extends ModalOverlayProps {
	trigger?: React.ReactNode;
	children?: React.ReactNode;
	heading?: string;
	showHeading?: boolean;
	onClose?: () => void;
	/** When closing the modal which URL to navigate to */
	onCloseTo?: string;
}

// xxx: correct example
/**
 * This component allows you to create a dialog with a customizable trigger and content.
 * It supports both controlled and uncontrolled modes for managing the dialog's open state.
 *
 * @example
 * // Example usage with controlled `isOpen` prop
 * const [isOpen, setIsOpen] = useState(false);
 * return (
 *   <>
 *     <button onClick={() => setIsOpen(true)}>Open Dialog</button>
 *     <SendouDialog isOpen={isOpen}>
 *       <p>This is the dialog content.</p>
 *     </SendouDialog>
 *   </>
 * );
 *
 * @example
 * // Example usage with a SendouButton as the trigger
 * return (
 *   <SendouDialog
 *     trigger={<SendouButton>Open Dialog</SendouButton>}
 *   >
 *     This is the dialog content.
 *   </SendouDialog>
 * );
 */
export function SendouDialog({
	trigger,
	children,
	isOpen,
	...rest
}: SendouDialogProps) {
	return (
		// TODO: doing controlled open like this causes a warning, figure out why isOpen on Modal is not working like the docs indicate
		<DialogTrigger isOpen={isOpen}>
			{trigger}
			<DialogModal {...rest}>{children}</DialogModal>
		</DialogTrigger>
	);
}

function DialogModal({
	children,
	heading,
	showHeading = true,
	...rest
}: Omit<SendouDialogProps, "trigger">) {
	const navigate = useNavigate();

	const showCloseButton = rest.onClose || rest.onCloseTo;
	const onClose = () => {
		if (rest.onCloseTo) {
			navigate(rest.onCloseTo);
		} else if (rest.onClose) {
			rest.onClose();
		}
	};

	return (
		<ModalOverlay className={styles.overlay}>
			<Modal isOpen className={clsx(rest.className, styles.modal)}>
				<Dialog className={styles.dialog}>
					{showHeading ? (
						<div className={styles.headingContainer}>
							<Heading slot="title" className={styles.heading}>
								{heading}
							</Heading>
							{showCloseButton ? (
								<SendouButton
									icon={<CrossIcon />}
									variant="minimal-destructive"
									onPress={onClose}
								/>
							) : null}
						</div>
					) : null}
					{children}
				</Dialog>
			</Modal>
		</ModalOverlay>
	);
}
