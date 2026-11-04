import { RefreshCw, Tv } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ModeImage, StageImage } from "~/components/Image";
import { SideNavHeader } from "~/components/SideNav";
import { StreamListItems } from "~/components/StreamListItems";
import { useUser } from "~/features/auth/core/user";
import { useLayoutData } from "~/features/layout/LayoutDataProvider";
import type * as SplatoonRotationRepository from "~/features/splatoon-rotations/SplatoonRotationRepository.server";
import {
	SPLATOON_ROTATION_TYPES,
	type SplatoonRotationType,
} from "~/features/splatoon-rotations/splatoon-rotations-constants";
import { useFormatDistanceToNow } from "~/hooks/intl/useFormatDistanceToNow";
import { shortStageName } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { SPLATOON_3_INK } from "~/utils/urls";
import styles from "./FeedSidebar.module.css";

// xxx: this would not belong to feed feature

type Rotation = Awaited<
	ReturnType<typeof SplatoonRotationRepository.findAll>
>[number];

const ROTATION_TYPE_LABELS = {
	SERIES: "front:rotations.series",
	OPEN: "front:rotations.open",
	X: "front:rotations.x",
} as const satisfies Record<SplatoonRotationType, string>;

export function FeedSidebar({
	rotations,
	now,
}: {
	rotations: Rotation[];
	/** Database timestamp the rotations are shown relative to */
	now: number;
}) {
	const { t } = useTranslation(["front"]);
	const user = useUser();
	const { sidebar } = useLayoutData();
	const streams = sidebar?.streams ?? [];

	return (
		<aside className={styles.sidebar}>
			<RotationsPanel rotations={rotations} now={now} />
			<section className={styles.panel}>
				<SideNavHeader icon={<Tv />}>
					{t("front:sideNav.streams")}
				</SideNavHeader>
				<div className={styles.streams}>
					{streams.length === 0 ? (
						<div className={styles.empty}>{t("front:sideNav.noStreams")}</div>
					) : (
						<StreamListItems
							streams={streams}
							isLoggedIn={Boolean(user)}
							savedTournamentIds={sidebar?.savedTournamentIds}
						/>
					)}
				</div>
			</section>
		</aside>
	);
}

function RotationsPanel({
	rotations,
	now,
}: {
	rotations: Rotation[];
	now: number;
}) {
	const { t } = useTranslation(["front", "game-misc"]);
	const formatDistanceToNow = useFormatDistanceToNow();

	const rows = SPLATOON_ROTATION_TYPES.flatMap((type) => {
		const upcoming = rotations
			.filter((rotation) => rotation.type === type && rotation.endsAt > now)
			.sort((a, b) => a.startsAt - b.startsAt);
		const current = upcoming.find((rotation) => rotation.startsAt <= now);
		if (!current) return [];

		return [
			{
				type,
				current,
				next: upcoming.find((rotation) => rotation.startsAt >= current.endsAt),
			},
		];
	});

	if (rows.length === 0) return null;

	const { startsAt, endsAt } = rows[0].current;
	const progress = (now - startsAt) / (endsAt - startsAt);

	return (
		<section className={styles.panel}>
			<SideNavHeader
				icon={<RefreshCw />}
				action={
					<span className={styles.endsIn}>
						Ends {formatDistanceToNow(endsAt, { addSuffix: true })}
					</span>
				}
			>
				Rotations
			</SideNavHeader>
			<div className={styles.progress}>
				<div
					className={styles.progressBar}
					style={{ width: `${Math.min(1, progress) * 100}%` }}
				/>
			</div>
			<ul className={styles.rotations}>
				{rows.map(({ type, current, next }) => (
					<li key={type} className={styles.rotation}>
						<div className={styles.rotationHeader}>
							<ModeImage mode={current.mode as ModeShort} width={22} />
							<span className={styles.rotationMode}>
								{t(`game-misc:MODE_LONG_${current.mode as ModeShort}`)}
							</span>
							<span className={styles.rotationType}>
								{t(ROTATION_TYPE_LABELS[type])}
							</span>
						</div>
						<div className={styles.stages}>
							{[current.stageId1, current.stageId2].map((stageId) => (
								<div key={stageId} className={styles.stage}>
									<StageImage
										stageId={stageId as StageId}
										width={160}
										className={styles.stageImage}
										containerClassName={styles.stageImageContainer}
									/>
									<span className={styles.stageName}>
										{t(`game-misc:STAGE_${stageId as StageId}`)}
									</span>
								</div>
							))}
						</div>
						{next ? (
							<div className={styles.next}>
								<span className={styles.nextLabel}>
									{t("front:rotations.nextLabel")}
								</span>
								<ModeImage mode={next.mode as ModeShort} width={14} />
								<span className={styles.nextStages}>
									{shortStageName(
										t(`game-misc:STAGE_${next.stageId1 as StageId}`),
									)}
									,{" "}
									{shortStageName(
										t(`game-misc:STAGE_${next.stageId2 as StageId}`),
									)}
								</span>
							</div>
						) : null}
					</li>
				))}
			</ul>
			<div className={styles.credit}>
				<a href={SPLATOON_3_INK} target="_blank" rel="noopener noreferrer">
					{t("front:rotations.credit")}
				</a>
			</div>
		</section>
	);
}
