import { Ability } from "~/components/Ability";
import { WeaponImage } from "~/components/Image";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	DEATH_EVENT_TYPE,
	type DeathData,
} from "../core/detectors/death/index";
import { FrameThumb } from "./FrameThumb";
import { weaponLabel } from "./labels";
import { MetaPills } from "./MetaChips";

export function DeathCard(props: {
	t: number;
	confidence: number;
	data: DeathData;
	thumbnail?: string;
	detectedAt?: number;
	/** lazy loader for the exact analyzed frame — enables fixture export */
	getFrame?: () => Promise<Blob | null | undefined>;
	onInspect?: () => void;
}) {
	const { t, confidence, data, thumbnail, detectedAt, getFrame, onInspect } =
		props;
	const weaponName = weaponLabel(data.weaponType, data.weaponId);
	return (
		<div className="card">
			<div className="meta">
				<MetaPills
					t={t}
					confidence={confidence}
					type={DEATH_EVENT_TYPE}
					label="death"
				/>
				{detectedAt && <span>{new Date(detectedAt).toLocaleTimeString()}</span>}
				<FrameThumb
					thumbnail={thumbnail}
					getFrame={getFrame}
					onInspect={onInspect}
					fixture={{ data, type: "Death" }}
				/>
			</div>
			<div className="teams death">
				<div className="team">
					<div className="death-body">
						{data.weaponId !== null && data.weaponType === "MAIN" ? (
							<WeaponImage
								weaponSplId={data.weaponId as MainWeaponId}
								variant="build"
								size={28}
								className="weapon-icon"
							/>
						) : null}
						<div className="death-info">
							<span className="death-name">
								splatted by <b>{data.name ?? "?"}</b>
							</span>
							<span className="death-weapon">{weaponName ?? "?"}</span>
						</div>
						<div className="death-abilities">
							{data.abilities.map((row, i) => (
								<div key={i} className="gear">
									{row.map((id, j) => (
										<Ability
											key={j}
											ability={id}
											size={j === 0 ? "SUBTINY" : "TINY"}
										/>
									))}
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
