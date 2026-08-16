import * as React from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { type FetcherWithComponents, useFetcher } from "react-router";
import {
	SendouButton,
	type SendouButtonProps,
} from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { useHydrated } from "~/hooks/useHydrated";
import invariant from "~/utils/invariant";
import { FormMessage } from "./FormMessage";
import { SubmitButton } from "./SubmitButton";

interface ChildProps {
	onPress?: () => void;
	type?: "button";
}

export function FormWithConfirm({
	fields,
	children,
	dialogHeading,
	description,
	submitButtonText,
	action,
	submitButtonTestId = "submit-button",
	submitButtonVariant = "destructive",
	fetcher: _fetcher,
	isOpen,
	onOpenChange,
	onConfirm,
}: {
	fields?: (
		| [name: string, value: string | number]
		| readonly [name: string, value: string | number]
	)[];
	children?: React.ReactElement<ChildProps>;
	dialogHeading: string;
	/** Optional explanatory text shown below the heading in the confirm dialog */
	description?: React.ReactNode;
	submitButtonText?: string;
	action?: string;
	submitButtonTestId?: string;
	submitButtonVariant?: SendouButtonProps["variant"];
	fetcher?: FetcherWithComponents<any>;
	/** Controls the dialog open state. When provided, no child trigger is needed. */
	isOpen?: boolean;
	onOpenChange?: (isOpen: boolean) => void;
	/** Confirming runs this callback instead of submitting a form (client only action) */
	onConfirm?: () => void;
}) {
	const componentsFetcher = useFetcher();
	const fetcher = _fetcher ?? componentsFetcher;

	const isHydrated = useHydrated();
	const { t } = useTranslation(["common"]);
	const [internalOpen, setInternalOpen] = React.useState(false);
	const formRef = React.useRef<HTMLFormElement>(null);
	const id = React.useId();

	const isControlled = isOpen !== undefined;
	const dialogOpen = isControlled ? isOpen : internalOpen;

	const openDialog = () => {
		onOpenChange?.(true);
		setInternalOpen(true);
	};
	const closeDialog = () => {
		onOpenChange?.(false);
		setInternalOpen(false);
	};

	invariant(!children || React.isValidElement(children));

	return (
		<>
			{isHydrated && !onConfirm
				? // using portal here makes nesting this component in another form work
					createPortal(
						<fetcher.Form
							id={id}
							className="hidden"
							ref={formRef}
							method="post"
							action={action}
							onSubmit={closeDialog}
						>
							{fields?.map(([name, value]) => (
								<input type="hidden" key={name} name={name} value={value} />
							))}
						</fetcher.Form>,
						document.body,
					)
				: null}
			<SendouDialog
				isOpen={dialogOpen}
				onClose={closeDialog}
				onOpenChange={closeDialog}
				isDismissable
			>
				<div className="stack md">
					<h2 className="text-md text-center">{dialogHeading}</h2>
					{description ? (
						<FormMessage type="info">{description}</FormMessage>
					) : null}
					<div className="stack horizontal md justify-center mt-2">
						{onConfirm ? (
							<SendouButton
								variant={submitButtonVariant}
								testId={dialogOpen ? "confirm-button" : submitButtonTestId}
								onPress={() => {
									closeDialog();
									onConfirm();
								}}
							>
								{submitButtonText ?? t("common:actions.delete")}
							</SendouButton>
						) : (
							<SubmitButton
								form={id}
								variant={submitButtonVariant}
								testId={dialogOpen ? "confirm-button" : submitButtonTestId}
							>
								{submitButtonText ?? t("common:actions.delete")}
							</SubmitButton>
						)}
					</div>
				</div>
			</SendouDialog>
			{children
				? React.cloneElement(children, {
						onPress: openDialog,
						type: "button",
					})
				: null}
		</>
	);
}
