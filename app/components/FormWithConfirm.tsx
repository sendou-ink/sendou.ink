import { type FetcherWithComponents, useFetcher } from "@remix-run/react";
import * as React from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { SendouDialog } from "~/components/elements/Dialog";
import { useIsMounted } from "~/hooks/useIsMounted";
import invariant from "~/utils/invariant";
import { Button, type ButtonProps } from "./Button";
import { SubmitButton } from "./SubmitButton";

export function FormWithConfirm({
	fields,
	children,
	dialogHeading,
	submitButtonText,
	cancelButtonText,
	action,
	submitButtonTestId = "submit-button",
	submitButtonVariant = "destructive",
	cancelButtonVariant,
	fetcher: _fetcher,
}: {
	fields?: (
		| [name: string, value: string | number]
		| readonly [name: string, value: string | number]
	)[];
	children: React.ReactNode;
	dialogHeading: string;
	submitButtonText?: string;
	cancelButtonText?: string;
	action?: string;
	submitButtonTestId?: string;
	submitButtonVariant?: ButtonProps["variant"];
	cancelButtonVariant?: ButtonProps["variant"];
	fetcher?: FetcherWithComponents<any>;
}) {
	const componentsFetcher = useFetcher();
	const fetcher = _fetcher ?? componentsFetcher;

	const isMounted = useIsMounted();
	const { t } = useTranslation(["common"]);
	const [dialogOpen, setDialogOpen] = React.useState(false);
	const formRef = React.useRef<HTMLFormElement>(null);
	const id = React.useId();

	const openDialog = React.useCallback(() => setDialogOpen(true), []);
	const closeDialog = React.useCallback(() => setDialogOpen(false), []);

	invariant(React.isValidElement(children));

	React.useEffect(() => {
		if (fetcher.state === "loading") {
			closeDialog();
		}
	}, [fetcher.state, closeDialog]);

	// xxx: onclick outside dismiss not working (e.g. accept scrim page)
	return (
		<>
			{isMounted
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
			<SendouDialog isOpen={dialogOpen} onClose={closeDialog}>
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
						<Button onClick={closeDialog} variant={cancelButtonVariant}>
							{cancelButtonText ?? t("common:actions.cancel")}
						</Button>
					</div>
				</div>
			</SendouDialog>
			{React.cloneElement(children, {
				// @ts-expect-error broke with @types/react upgrade. TODO: figure out narrower type than React.ReactNode
				onClick: openDialog, // TODO: when SendouButton has overtaken Button, this line can be removed
				onPress: openDialog,
				type: "button",
			})}
		</>
	);
}
