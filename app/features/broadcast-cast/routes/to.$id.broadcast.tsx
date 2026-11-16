import { useTranslation } from "react-i18next";
import { SendouSection } from "~/components/elements/Section";
import { useUser } from "~/features/auth/core/user";
import { useTournament } from "~/features/tournament/tournament-context";
import { adminStreamFormSchema } from "~/features/tournament-admin/tournament-admin-staff-schemas";
import { SendouForm } from "~/form/SendouForm";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { loader } from "../loaders/to.$id.broadcast.server";

export { action } from "../actions/to.$id.broadcast.server";
export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["broadcast"],
	showScanner: true,
};

/** Shown only while the tournament has no cast channels, otherwise the loader redirects to a channel's dashboard. */
export default function TournamentBroadcastPage() {
	const { t } = useTranslation(["broadcast"]);
	const tournament = useTournament();
	const user = useUser();
	const canAddChannel =
		tournament.isOrganizer(user) && !tournament.ctx.isFinalized;

	return (
		<SendouSection title={t("broadcast:title")}>
			<div className="stack md">
				<p className="text-sm">
					{t("broadcast:empty.description")}{" "}
					{tournament.ctx.isFinalized
						? null
						: canAddChannel
							? t("broadcast:empty.getStarted")
							: t("broadcast:empty.askOrganizer")}
				</p>
				{canAddChannel ? (
					<SendouForm
						schema={adminStreamFormSchema}
						defaultValues={{ castAccounts: [""] }}
						submitButtonText={t("broadcast:addChannel")}
						submitButtonTestId="add-cast-channel-button"
						fullWidth
					>
						{({ FormField }) => <FormField name="castAccounts" />}
					</SendouForm>
				) : null}
			</div>
		</SendouSection>
	);
}
