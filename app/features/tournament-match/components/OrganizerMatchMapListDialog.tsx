import type { TFunction } from "i18next";
import { Map as MapIcon } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { useTournament } from "~/features/tournament/tournament-context";
import type { TournamentMatchLoaderData } from "../loaders/to.$id.matches.$mid.server";
import { useMatch } from "../match-page-context";
import { pickInfoText } from "../tournament-match-utils";

export function OrganizerMatchMapListDialog({
	data,
}: {
	data: TournamentMatchLoaderData;
}) {
	const { t } = useTranslation(["game-misc", "tournament"]);
	const [isOpen, setIsOpen] = React.useState(false);
	const tournament = useTournament();
	const {
		teams: [teamOne, teamTwo],
	} = useMatch();
	if (!teamOne || !teamTwo) return null;

	const bannedMaps = data.mapList?.filter(
		(map) => map.bannedByTournamentTeamId,
	);

	const playableSlots = R.times(
		Math.max(data.mapList?.length ?? 0, data.match.roundMaps?.count ?? 0),
		(i) => ({ key: i, map: data.mapList?.[i] }),
	).filter(({ map }) => !map?.bannedByTournamentTeamId);

	return (
		<>
			<SendouDialog
				heading={`${teamOne.name} vs. ${teamTwo.name}`}
				isOpen={isOpen}
				onClose={() => setIsOpen(false)}
				className="w-max"
			>
				<div className="mt-2">
					{playableSlots.map(({ key, map }, slotIndex) => {
						const number = slotIndex + 1;

						if (!map)
							return (
								<div key={key}>
									{number}){" "}
									<span className="text-lighter text-xs italic">
										Counterpick
									</span>
								</div>
							);

						return (
							<div key={key}>
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
			</SendouDialog>
			<SendouButton
				variant="outlined"
				size="small"
				icon={<MapIcon />}
				onClick={() => setIsOpen(true)}
			>
				Show maplist
			</SendouButton>
		</>
	);
}
