import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useEffect, useRef } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { SelectFormField } from "~/components/form/SelectFormField";
import { TextAreaFormField } from "~/components/form/TextAreaFormField";
import { StageSelect } from "~/components/StageSelect";
import type { Tables } from "~/db/tables";
import { TIMEZONES } from "~/features/lfg/lfg-constants";
import { type allWidgetsFlat, findWidgetById } from "../core/widgets/portfolio";
import { USER } from "../user-page-constants";

export function WidgetSettingsForm({
	widget,
	onSettingsChange,
}: {
	widget: Tables["UserWidget"]["widget"];
	onSettingsChange: (widgetId: string, settings: any) => void;
}) {
	const schema = getWidgetSchema(widget.id);

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
	schema: WidgetWithSettings["schema"];
	onSettingsChange: (widgetId: string, settings: any) => void;
}) {
	const { t } = useTranslation(["user"]);
	const methods = useForm({
		resolver: standardSchemaResolver(schema),
		defaultValues: (widget.settings ?? {}) as any,
	});

	const values = useWatch({ control: methods.control });
	const isFirstRender = useRef(true);
	const onSettingsChangeRef = useRef(onSettingsChange);
	const widgetIdRef = useRef(widget.id);

	onSettingsChangeRef.current = onSettingsChange;
	widgetIdRef.current = widget.id;

	useEffect(() => {
		if (isFirstRender.current) {
			isFirstRender.current = false;
			return;
		}

		if (Object.keys(values).length > 0) {
			onSettingsChangeRef.current(widgetIdRef.current, values);
		}
	}, [values]);

	const formFields = (() => {
		switch (widget.id) {
			case "bio":
				return (
					<TextAreaFormField
						label={t("widgets.forms.bio")}
						name="bio"
						maxLength={USER.BIO_MAX_LENGTH}
					/>
				);
			case "bio-md":
				return (
					<TextAreaFormField
						label={t("widgets.forms.bio")}
						name="bio"
						bottomText={t("widgets.forms.bio.markdownSupport")}
						maxLength={USER.BIO_MD_MAX_LENGTH}
					/>
				);
			case "x-rank-peaks":
				return (
					<SelectFormField
						label={t("widgets.forms.division")}
						name="division"
						values={[
							{ value: "both", label: t("widgets.forms.division.both") },
							{
								value: "tentatek",
								label: t("widgets.forms.division.tentatek"),
							},
							{
								value: "takoroka",
								label: t("widgets.forms.division.takoroka"),
							},
						]}
					/>
				);
			case "timezone":
				return (
					<SelectFormField
						label={t("widgets.forms.timezone")}
						name="timezone"
						values={TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
					/>
				);
			case "favorite-stage":
				return (
					<StageSelect
						label={t("widgets.forms.favoriteStage")}
						value={methods.watch("stageId")}
						onChange={(stageId) => methods.setValue("stageId", stageId)}
					/>
				);
			default:
				return null;
		}
	})();

	return <FormProvider {...methods}>{formFields}</FormProvider>;
}

type WidgetWithSettings = Extract<
	ReturnType<typeof allWidgetsFlat>[number],
	{ schema: unknown }
>;

function getWidgetSchema(widgetId: string) {
	const widget = findWidgetById(widgetId);
	if (widget && "schema" in widget) {
		return widget.schema;
	}
	return null;
}
