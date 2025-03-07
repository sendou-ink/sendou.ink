import { type FetcherWithComponents, useFetcher } from "@remix-run/react";
import * as React from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useIsMounted } from "~/hooks/useIsMounted";
import invariant from "~/utils/invariant";
import { Button, type ButtonProps } from "./Button";
import { Dialog } from "./Dialog";
import { SubmitButton } from "./SubmitButton";

export function FormWithConfirm({
	fields,
	children,
	dialogHeading,
	deleteButtonText,
	cancelButtonText,
	action,
	submitButtonTestId = "submit-button",
	submitButtonVariant = "destructive",
	fetcher: _fetcher,
}: {
	fields?: (
		| [name: string, value: string | number]
		| readonly [name: string, value: string | number]
	)[];
	children: React.ReactNode;
	dialogHeading: string;
	deleteButtonText?: string;
	cancelButtonText?: string;
	action?: string;
	submitButtonTestId?: string;
	submitButtonVariant?: ButtonProps["variant"];
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
			<Dialog isOpen={dialogOpen} close={closeDialog} className="text-center">
				<div className="stack md">
					<h2 className="text-sm">{dialogHeading}</h2>
					<div className="stack horizontal md justify-center">
						<SubmitButton
							form={id}
							variant={submitButtonVariant}
							testId={dialogOpen ? "confirm-button" : submitButtonTestId}
						>
							{deleteButtonText ?? t("common:actions.delete")}
						</SubmitButton>
						<Button onClick={closeDialog}>
							{cancelButtonText ?? t("common:actions.cancel")}
						</Button>
					</div>
				</div>
			</Dialog>
			{React.cloneElement(children, {
				// @ts-expect-error broke with @types/react upgrade. TODO: figure out narrower type than React.ReactNode
				onClick: openDialog, // TODO: when SendouButton has overtaken Button, this line can be removed
				onPress: openDialog,
				type: "button",
			})}
		</>
	);
}
