import type { SerializeFrom } from "@remix-run/node";
import type { TFunction } from "i18next";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/Button";
import { Dialog } from "~/components/Dialog";
import { MapIcon } from "~/components/icons/Map";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { nullFilledArray } from "~/utils/arrays";
import type { TournamentMatchLoaderData } from "../routes/to.$id.matches.$mid";
import { pickInfoText } from "../tournament-bracket-utils";

export function OrganizerMatchMapListDialog({
	data,
}: {
	data: SerializeFrom<TournamentMatchLoaderData>;
}) {
	const { t } = useTranslation(["game-misc", "tournament"]);
	const [isOpen, setIsOpen] = React.useState(false);
	const tournament = useTournament();

	const teamOne = data.match.opponentOne?.id
		? tournament.teamById(data.match.opponentOne.id)
		: undefined;
	const teamTwo = data.match.opponentTwo?.id
		? tournament.teamById(data.match.opponentTwo.id)
		: undefined;

	if (!teamOne || !teamTwo) return null;

	const bannedMaps = data.mapList?.filter(
		(map) => map.bannedByTournamentTeamId,
	);

	let number = 0;
	return (
		<>
			<Dialog isOpen={isOpen} close={() => setIsOpen(false)} className="w-max">
				<h2 className="text-md">
					{teamOne.name} vs. {teamTwo.name}
				</h2>
				<div className="mt-2">
					{nullFilledArray(
						Math.max(
							data.mapList?.length ?? 0,
							data.match.roundMaps?.count ?? 0,
						),
					).map((_, i) => {
						const map = data.mapList?.[i];

						if (map?.bannedByTournamentTeamId) return null;

						number++;

						if (!map)
							return (
								<div key={i}>
									{number}){" "}
									<span className="text-lighter text-xs italic">
										Counterpick
									</span>
								</div>
							);

						return (
							<div key={i}>
								{number}) {t(`game-misc:MODE_LONG_${map.mode}`)} on{" "}
								{t(`game-misc:STAGE_${map.stageId}`)}{" "}
								<span className="text-lighter text-xs italic ml-1">
									{pickInfoText({
										t: t as unknown as TFunction<["tournament"]>,
										teams: [teamOne, teamTwo],
										map,
									})}
								</span>
							</div>
						);
					})}
				</div>
				{bannedMaps && bannedMaps?.length > 0 ? (
					<div className="mt-2">
						<h3 className="text-sm">Banned maps</h3>
						<div className="text-xs">
							{bannedMaps.map((map, i) => {
								const bannedByTeam = tournament.teamById(
									map.bannedByTournamentTeamId!,
								);

								return (
									<div key={i}>
										{t(`game-misc:MODE_LONG_${map.mode}`)} on{" "}
										{t(`game-misc:STAGE_${map.stageId}`)}{" "}
										<span className="italic text-lighter">
											by {bannedByTeam?.name}
										</span>
									</div>
								);
							})}
						</div>
					</div>
				) : null}
			</Dialog>
			<Button
				variant="outlined"
				size="tiny"
				icon={<MapIcon />}
				onClick={() => setIsOpen(true)}
			>
				Show maplist
			</Button>
		</>
	);
}
