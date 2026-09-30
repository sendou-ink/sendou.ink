import type * as React from "react";
import { useTranslation } from "react-i18next";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";

const WEEK_VALUES = ["current", "next"] as const;

export type WeekToggleValue = (typeof WEEK_VALUES)[number];

/** The current/next week chip toggle shared by the schedule surfaces. */
export function WeekToggle({
	name,
	value,
	onChange,
	renderExtra,
}: {
	name: string;
	value: WeekToggleValue;
	onChange: (value: WeekToggleValue) => void;
	/** Rendered after a chip's label, e.g. the editor's "not filled" marker. */
	renderExtra?: (week: WeekToggleValue) => React.ReactNode;
}) {
	const { t } = useTranslation(["schedule"]);

	const label = (week: WeekToggleValue) =>
		week === "current"
			? t("schedule:team.currentWeek")
			: t("schedule:team.nextWeek");

	return (
		<SendouChipRadioGroup>
			{WEEK_VALUES.map((week) => (
				<SendouChipRadio
					key={week}
					name={name}
					value={week}
					checked={value === week}
					onChange={() => onChange(week)}
				>
					{renderExtra ? (
						<span>
							{label(week)}
							{renderExtra(week)}
						</span>
					) : (
						label(week)
					)}
				</SendouChipRadio>
			))}
		</SendouChipRadioGroup>
	);
}
