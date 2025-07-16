import { useFetcher, useLoaderData } from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-use";
import { SendouDialog } from "~/components/elements/Dialog";
import { SendouSwitch } from "~/components/elements/Switch";
import { FormMessage } from "~/components/FormMessage";
import { SubmitButton } from "~/components/SubmitButton";
import { action } from "../actions/to.$id.brackets.finalize.server";
import {
	type FinalizeTournamentLoaderData,
	loader,
} from "../loaders/to.$id.brackets.finalize.server";
export { action, loader };

export default function TournamentFinalizePage() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["tournament"]);
	const location = useLocation();
	const [isAssignLaterSelected, setIsAssignLaterSelected] =
		React.useState(false);

	const bracketUrl = location.pathname?.replace(/\/finalize$/, "");

	const tournamentHasBadges = data.badges.length > 0;

	return (
		<SendouDialog
			isOpen
			onCloseTo={bracketUrl}
			heading={t("tournament:actions.finalize")}
		>
			<FinalizeForm>
				{tournamentHasBadges ? (
					<>
						<SendouSwitch
							isSelected={isAssignLaterSelected}
							onChange={setIsAssignLaterSelected}
						>
							Assign badges later manually
						</SendouSwitch>
						{!isAssignLaterSelected ? (
							<NewBadgeOwnersSelector
								badges={data.badges}
								standings={data.standings}
							/>
						) : null}
					</>
				) : null}
			</FinalizeForm>
		</SendouDialog>
	);
}

// xxx: state in this component or the parent?
function FinalizeForm({ children }: { children: React.ReactNode }) {
	const fetcher = useFetcher();
	const { t } = useTranslation(["tournament"]);

	return (
		<fetcher.Form method="post" className="stack md">
			<input type="hidden" name="_action" value="FINALIZE_TOURNAMENT" />
			<div>{children}</div>
			<div className="stack horizontal md justify-center mt-2">
				<SubmitButton testId="confirm-button">
					{t("tournament:actions.finalize.action")}
				</SubmitButton>
			</div>
			<FormMessage type="info" className="text-center">
				{t("tournament:actions.finalize.info")}
			</FormMessage>
		</fetcher.Form>
	);
}

function NewBadgeOwnersSelector({
	badges,
	standings,
}: {
	badges: FinalizeTournamentLoaderData["badges"];
	standings: FinalizeTournamentLoaderData["standings"];
}) {
	return <div>{JSON.stringify({ badges, standings })}</div>;
}
