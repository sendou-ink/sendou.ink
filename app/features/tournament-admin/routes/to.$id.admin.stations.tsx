import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { InfoPopover } from "~/components/InfoPopover";
import * as LiveStream from "~/features/live-streams/core/LiveStream";
import { STREAM_PLATFORM_NAMES } from "~/features/live-streams/live-streams-constants";
import { useTournament } from "~/features/tournament/tournament-context";
import { stationsFormSchema } from "~/features/tournament-stations/tournament-stations-schemas";
import { SendouForm } from "~/form/SendouForm";
import type { ArrayItemRenderContext, SelectOption } from "~/form/types";
import type { loader } from "../loaders/to.$id.admin.stations.server";

export { action } from "../actions/to.$id.admin.stations.server";
export { loader } from "../loaders/to.$id.admin.stations.server";

export default function TournamentAdminStationsPage() {
	const { stations } = useLoaderData<typeof loader>();
	const tournament = useTournament();

	const castAccountOptions: SelectOption[] = (
		tournament.ctx.castAccounts ?? []
	).map((account) => ({
		value: LiveStream.key(account),
		label: `${account.name} (${STREAM_PLATFORM_NAMES[account.platform]})`,
	}));

	return (
		<SendouForm
			// new stations get their ids on save, a stale form would recreate them on the next one
			key={stations.map((station) => station.id).join(",")}
			schema={stationsFormSchema}
			fullWidth
			submitButtonTestId="save-stations-button"
			defaultValues={{
				autoAssign: tournament.autoAssignsStations,
				stations: stations.map((station) => {
					const castAccountKey = station.castAccount
						? LiveStream.key(station.castAccount)
						: null;

					return {
						stationId: station.id,
						name: station.name,
						locationNote: station.locationNote,
						castAccount: castAccountOptions.some(
							(option) => option.value === castAccountKey,
						)
							? castAccountKey
							: null,
					};
				}),
			}}
		>
			{({ FormField }) => (
				<>
					<FormField
						name="autoAssign"
						labelPopover={<AutoAssignInfoPopover />}
					/>
					<FormField name="stations">
						{({ itemName }: ArrayItemRenderContext) => (
							<div className="stack sm">
								<FormField name={`${itemName}.name`} />
								<FormField name={`${itemName}.locationNote`} />
								{castAccountOptions.length > 0 ? (
									<FormField
										name={`${itemName}.castAccount`}
										options={castAccountOptions}
									/>
								) : null}
							</div>
						)}
					</FormField>
				</>
			)}
		</SendouForm>
	);
}

function AutoAssignInfoPopover() {
	const { t } = useTranslation(["tournament"]);

	return (
		<InfoPopover tiny>
			<div className="stack xs text-sm">
				<div>{t("tournament:stations.autoAssign.intro")}</div>
				<ul className="stack xs">
					<li>{t("tournament:stations.autoAssign.stream")}</li>
					<li>{t("tournament:stations.autoAssign.order")}</li>
					<li>{t("tournament:stations.autoAssign.stay")}</li>
					<li>{t("tournament:stations.autoAssign.lowest")}</li>
					<li>{t("tournament:stations.autoAssign.waiting")}</li>
					<li>{t("tournament:stations.autoAssign.manual")}</li>
				</ul>
			</div>
		</InfoPopover>
	);
}
