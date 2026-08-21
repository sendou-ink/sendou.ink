import { useTranslation } from "react-i18next";
import type { Tables } from "~/db/tables";
import { type CustomFieldRenderProps, FormField } from "~/form/FormField";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";
import {
	getWidgetFormSchema,
	TIMEZONE_OPTIONS,
} from "../core/widgets/widget-form-schemas";
import { USER } from "../user-page-constants";
import { GameBadgeSelectField } from "./GameBadgeSelectField";

export function WidgetSettingsForm({
	widget,
	onSettingsChange,
}: {
	widget: Tables["UserWidget"]["widget"];
	onSettingsChange: (widgetId: string, settings: unknown) => void;
}) {
	const schema = getWidgetFormSchema(widget.id);

	if (!schema) {
		return null;
	}

	return (
		<WidgetSettingsFormInner
			widget={widget}
			schema={schema}
			onSettingsChange={onSettingsChange}
		/>
	);
}

function WidgetSettingsFormInner({
	widget,
	schema,
	onSettingsChange,
}: {
	widget: Tables["UserWidget"]["widget"];
	schema: ReturnType<typeof getWidgetFormSchema>;
	onSettingsChange: (widgetId: string, settings: unknown) => void;
}) {
	if (!schema) return null;

	const handleApply = (values: unknown) => {
		onSettingsChange(widget.id, values);
	};

	const defaultValues = widget.settings ?? {};

	return (
		<SendouForm
			schema={schema}
			defaultValues={defaultValues}
			mode="client"
			onApply={handleApply}
			className="stack md"
		>
			<WidgetFormFields widgetId={widget.id} />
		</SendouForm>
	);
}

function WidgetFormFields({ widgetId }: { widgetId: string }) {
	switch (widgetId) {
		case "bio":
		case "bio-md":
			return <FormField name="bio" />;
		case "x-rank-peaks":
			return <FormField name="division" />;
		case "timezone":
			return <FormField name="timezone" options={TIMEZONE_OPTIONS} />;
		case "favorite-stage":
			return <FormField name="stageId" />;
		case "peak-xp-unverified":
			return (
				<div className="stack md">
					<FormField name="peakXp" />
					<FormField name="division" />
				</div>
			);
		case "peak-xp-weapon":
			return <FormField name="weaponSplId" />;
		case "sens":
			return <SensFields />;
		case "art":
			return <FormField name="source" />;
		case "links":
			return <FormField name="links" />;
		case "tier-list":
			return <FormField name="searchParams" />;
		case "game-badges":
			return (
				<FormField name="badgeIds">
					{(props: CustomFieldRenderProps) => (
						<GameBadgeSelectField
							{...(props as CustomFieldRenderProps<string[]>)}
							maxCount={USER.GAME_BADGES_MAX}
						/>
					)}
				</FormField>
			);
		case "game-badges-small":
			return (
				<FormField name="badgeIds">
					{(props: CustomFieldRenderProps) => (
						<GameBadgeSelectField
							{...(props as CustomFieldRenderProps<string[]>)}
							maxCount={USER.GAME_BADGES_SMALL_MAX}
						/>
					)}
				</FormField>
			);
		default:
			return null;
	}
}

const SENS_OPTIONS = [
	-50, -45, -40, -35, -30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 35,
	40, 45, 50,
];

function SensFields() {
	const { t } = useTranslation(["user"]);
	const { values, setValue, onFieldChange } = useFormFieldContext();

	const motionSens = (values.motionSens as number | null) ?? null;
	const stickSens = (values.stickSens as number | null) ?? null;

	const rawSensToString = (sens: number) =>
		`${sens > 0 ? "+" : ""}${sens / 10}`;

	const handleMotionSensChange = (sens: number | null) => {
		setValue("motionSens", sens);
		onFieldChange?.("motionSens", sens);
	};

	const handleStickSensChange = (sens: number | null) => {
		setValue("stickSens", sens);
		onFieldChange?.("stickSens", sens);
	};

	return (
		<div className="stack md">
			<FormField name="controller" />

			<div className="stack horizontal md">
				<div>
					<label htmlFor="motionSens">{t("user:motionSens")}</label>
					<select
						id="motionSens"
						value={motionSens ?? ""}
						onChange={(e) =>
							handleMotionSensChange(
								e.target.value === "" ? null : Number(e.target.value),
							)
						}
					>
						<option value="">{"-"}</option>
						{SENS_OPTIONS.map((sens) => (
							<option key={sens} value={sens}>
								{rawSensToString(sens)}
							</option>
						))}
					</select>
				</div>

				<div>
					<label htmlFor="stickSens">{t("user:stickSens")}</label>
					<select
						id="stickSens"
						value={stickSens ?? ""}
						onChange={(e) =>
							handleStickSensChange(
								e.target.value === "" ? null : Number(e.target.value),
							)
						}
					>
						<option value="">{"-"}</option>
						{SENS_OPTIONS.map((sens) => (
							<option key={sens} value={sens}>
								{rawSensToString(sens)}
							</option>
						))}
					</select>
				</div>
			</div>
		</div>
	);
}
