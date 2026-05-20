// xxx: use * as React syntax
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { TournamentSearch } from "~/components/elements/TournamentSearch";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import type { ScrimSide } from "../scrims-types";
import styles from "./ScrimMapListForm.module.css";

interface Props {
	viewerSide: ScrimSide;
}

export function ScrimMapListForm(_: Props) {
	const { t } = useTranslation(["scrims", "common"]);
	const fetcher = useFetcher();
	const [source, setSource] = useState<"TOURNAMENT" | "POOL">("POOL");
	const [tournamentId, setTournamentId] = useState<number | null>(null);
	const [poolInput, setPoolInput] = useState("");
	const [error, setError] = useState<string | null>(null);

	const onSubmit = () => {
		setError(null);

		if (source === "TOURNAMENT") {
			if (!tournamentId) {
				setError(t("scrims:mapByMap.form.tournamentRequired"));
				return;
			}
			fetcher.submit(
				{
					_action: "SUBMIT_MAP_LIST",
					source: "TOURNAMENT",
					tournamentId: String(tournamentId),
				},
				{ method: "post" },
			);
			return;
		}

		const serialized = extractSerializedPool(poolInput);
		if (!serialized) {
			setError(t("scrims:mapByMap.form.poolInvalid"));
			return;
		}

		try {
			const pool = new MapPool(serialized);
			if (pool.isEmpty()) {
				setError(t("scrims:mapByMap.form.poolInvalid"));
				return;
			}
		} catch {
			setError(t("scrims:mapByMap.form.poolInvalid"));
			return;
		}

		fetcher.submit(
			{
				_action: "SUBMIT_MAP_LIST",
				source: "POOL",
				serializedPool: serialized,
			},
			{ method: "post" },
		);
	};

	// xxx: migrate to SendouForm
	return (
		<div className={styles.root} data-testid="scrim-map-list-form">
			<div className={styles.sourceRow}>
				<label className={styles.sourceOption}>
					<input
						type="radio"
						name="source"
						value="POOL"
						data-testid="source-radio-pool"
						checked={source === "POOL"}
						onChange={() => setSource("POOL")}
					/>
					{t("scrims:mapByMap.form.sourcePool")}
				</label>
				<label className={styles.sourceOption}>
					<input
						type="radio"
						name="source"
						value="TOURNAMENT"
						data-testid="source-radio-tournament"
						checked={source === "TOURNAMENT"}
						onChange={() => setSource("TOURNAMENT")}
					/>
					{t("scrims:mapByMap.form.sourceTournament")}
				</label>
			</div>

			{source === "TOURNAMENT" ? (
				<TournamentSearch
					label={t("scrims:mapByMap.form.tournamentLabel")}
					initialTournamentId={tournamentId ?? undefined}
					onChange={(tournament) => setTournamentId(tournament?.id ?? null)}
				/>
			) : (
				<input
					type="text"
					data-testid="pool-input"
					placeholder={t("scrims:mapByMap.form.poolPlaceholder")}
					className={styles.input}
					value={poolInput}
					onChange={(e) => setPoolInput(e.target.value)}
				/>
			)}

			{error ? <div className={styles.error}>{error}</div> : null}

			<div className={styles.actions}>
				<SendouButton
					testId="submit-map-list-button"
					isDisabled={fetcher.state !== "idle"}
					onPress={onSubmit}
				>
					{t("common:actions.submit")}
				</SendouButton>
			</div>
		</div>
	);
}

// xxx: unit tested function, extract
function extractSerializedPool(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	if (trimmed.includes("://")) {
		try {
			const url = new URL(trimmed);
			return url.searchParams.get("pool");
		} catch {
			return null;
		}
	}

	if (trimmed.includes("pool=")) {
		const start = trimmed.indexOf("pool=") + "pool=".length;
		const next = trimmed.indexOf("&", start);
		return trimmed.slice(start, next === -1 ? undefined : next);
	}

	return trimmed;
}
