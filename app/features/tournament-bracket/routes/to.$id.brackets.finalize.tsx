import { useFetcher } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-use";
import { SendouDialog } from "~/components/elements/Dialog";
import { FormMessage } from "~/components/FormMessage";
import { SubmitButton } from "~/components/SubmitButton";
import { action } from "../actions/to.$id.brackets.finalize.server";
import { loader } from "../loaders/to.$id.brackets.finalize.server";
export { action, loader };

export default function TournamentFinalizePage() {
	const fetcher = useFetcher();
	const { t } = useTranslation(["tournament"]);
	const location = useLocation();

	const bracketUrl = location.pathname?.replace(/\/finalize$/, "");

	return (
		<SendouDialog
			isOpen
			onCloseTo={bracketUrl}
			heading={t("tournament:actions.finalize")}
		>
			<fetcher.Form method="post" className="stack md">
				<input type="hidden" name="_action" value="FINALIZE_TOURNAMENT" />
				<FormMessage type="info" className="text-center">
					{t("tournament:actions.finalize.info")}
				</FormMessage>
				<div className="stack horizontal md justify-center mt-2">
					<SubmitButton testId="confirm-button">
						{t("tournament:actions.finalize.action")}
					</SubmitButton>
				</div>
			</fetcher.Form>
		</SendouDialog>
	);
}
