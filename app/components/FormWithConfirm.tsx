import * as React from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { type FetcherWithComponents, useFetcher } from "react-router";
import type { SendouButtonProps } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { useHydrated } from "~/hooks/useHydrated";
import invariant from "~/utils/invariant";
import { SubmitButton } from "./SubmitButton";

interface ChildProps {
	onPress?: () => void;
	type?: "button";
}

export function FormWithConfirm({
	fields,
	children,
	dialogHeading,
	submitButtonText,
	action,
	submitButtonTestId = "submit-button",
	submitButtonVariant = "destructive",
	fetcher: _fetcher,
	isOpen,
	onOpenChange,
}: {
	fields?: (
		| [name: string, value: string | number]
		| readonly [name: string, value: string | number]
	)[];
	children?: React.ReactElement<ChildProps>;
	dialogHeading: string;
	submitButtonText?: string;
	action?: string;
	submitButtonTestId?: string;
	submitButtonVariant?: SendouButtonProps["variant"];
	fetcher?: FetcherWithComponents<any>;
	/** Controls the dialog open state. When provided, no child trigger is needed. */
	isOpen?: boolean;
	onOpenChange?: (isOpen: boolean) => void;
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

	const openDialog = React.useCallback(() => {
		onOpenChange?.(true);
		setInternalOpen(true);
	}, [onOpenChange]);
	const closeDialog = React.useCallback(() => {
		onOpenChange?.(false);
		setInternalOpen(false);
	}, [onOpenChange]);

	invariant(!children || React.isValidElement(children));

	React.useEffect(() => {
		if (fetcher.state === "loading") {
			closeDialog();
		}
	}, [fetcher.state, closeDialog]);

	return (
		<>
			{isHydrated
				? // using portal here makes nesting this component in another form work
					createPortal(
						<fetcher.Form
							id={id}
							className="hidden"
							ref={formRef}
							method="post"
							action={action}
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
					<div className="stack horizontal md justify-center mt-2">
						<SubmitButton
							form={id}
							variant={submitButtonVariant}
							testId={dialogOpen ? "confirm-button" : submitButtonTestId}
						>
							{submitButtonText ?? t("common:actions.delete")}
						</SubmitButton>
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
