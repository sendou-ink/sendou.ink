import clsx from "clsx";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { Alert } from "~/components/Alert";
import { useFormatDistanceToNow } from "~/hooks/intl/useFormatDistanceToNow";
import { SendouButton } from "../elements/Button";
import { SendouTabPanel } from "../elements/Tabs";
import styles from "./MatchJoinTab.module.css";
import { TAB_KEYS } from "./MatchTabs";

interface MatchJoinTabProps {
	joinLink?: string;
	hostedBy?: string;
	pool: string;
	pass: string;
	showNoSplatnetAlert: boolean;
	isStale?: boolean;
	staleMinutesAgo?: number;
	refreshedAt?: Date;
	onConfirmRoom?: () => void;
	isConfirming?: boolean;
}

export function MatchJoinTab({
	joinLink,
	hostedBy,
	pool,
	pass,
	showNoSplatnetAlert,
	isStale,
	staleMinutesAgo,
	refreshedAt,
	onConfirmRoom,
	isConfirming,
}: MatchJoinTabProps) {
	const { t } = useTranslation(["q"]);
	const formatDistanceToNow = useFormatDistanceToNow();

	return (
		<SendouTabPanel id={TAB_KEYS.JOIN}>
			<div className="stack lg">
				{showNoSplatnetAlert ? (
					<Alert variation="WARNING" tiny>
						{t("q:match.noSplatnetWarning")}
					</Alert>
				) : null}
				<div className={styles.joinContent}>
					{joinLink ? (
						isStale ? (
							<StaleRoomPrompt
								minutesAgo={staleMinutesAgo ?? 0}
								onConfirm={onConfirmRoom}
								isConfirming={isConfirming}
							/>
						) : (
							<>
								{refreshedAt ? (
									<div className={styles.roomAge}>
										{formatDistanceToNow(refreshedAt, { addSuffix: true })}
									</div>
								) : null}
								<div className={styles.qrCodeContainer}>
									<QRCodeSVG
										value={joinLink}
										size={140}
										className={styles.qrCode}
									/>
									<a
										href={joinLink}
										target="_blank"
										rel="noopener noreferrer"
										className={styles.joinLink}
									>
										{joinLink}
									</a>
								</div>
							</>
						)
					) : (
						<div className={clsx(styles.qrOverlay, styles.noRoomHint)}>
							{t("q:match.room.noRoomHint")}
						</div>
					)}
					<div className={styles.joinInfo}>
						{hostedBy ? (
							<InfoWithHeader
								header={t("q:match.hostedBy")}
								value={hostedBy}
								truncate
							/>
						) : null}
						<InfoWithHeader header={t("q:match.pool")} value={pool} />
						<InfoWithHeader
							header={t("q:match.password.short")}
							value={pass}
							testId="room-pass"
						/>
					</div>
				</div>
			</div>
		</SendouTabPanel>
	);
}

function StaleRoomPrompt({
	minutesAgo,
	onConfirm,
	isConfirming,
}: {
	minutesAgo: number;
	onConfirm?: () => void;
	isConfirming?: boolean;
}) {
	const { t } = useTranslation(["q"]);

	return (
		<div className={clsx(styles.qrOverlay, styles.stalePrompt)}>
			<div className={styles.staleText}>
				{t("q:match.room.stalePrompt", { minutes: minutesAgo })}
			</div>
			<SendouButton
				variant="outlined"
				size="small"
				onPress={onConfirm}
				isDisabled={isConfirming}
			>
				{t("q:match.room.confirm")}
			</SendouButton>
		</div>
	);
}

function InfoWithHeader({
	header,
	value,
	testId,
	truncate,
}: {
	header: string;
	value: string;
	testId?: string;
	truncate?: boolean;
}) {
	return (
		<div>
			<div className={styles.infoHeader}>{header}</div>
			<div
				className={clsx(styles.infoValue, {
					[styles.infoValueTruncate]: truncate,
				})}
				data-testid={testId}
				title={truncate ? value : undefined}
			>
				{value}
			</div>
		</div>
	);
}
