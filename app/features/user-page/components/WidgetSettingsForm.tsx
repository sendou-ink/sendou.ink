import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useEffect, useRef } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { SelectFormField } from "~/components/form/SelectFormField";
import { TextAreaFormField } from "~/components/form/TextAreaFormField";
import type { Tables } from "~/db/tables";
import { ALL_WIDGETS } from "../core/widgets/portfolio";
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
						label="Bio"
						name="bio"
						maxLength={USER.BIO_MAX_LENGTH}
					/>
				);
			case "bio-md":
				return (
					<TextAreaFormField
						label="Bio"
						name="bio"
						bottomText="Supports Markdown"
						maxLength={USER.BIO_MD_MAX_LENGTH}
					/>
				);
			case "x-rank-peaks":
				return (
					<SelectFormField
						label="Division"
						name="division"
						values={[
							{ value: "both", label: "Both divisions" },
							{ value: "tentatek", label: "Tentatek only" },
							{ value: "takoroka", label: "Takoroka only" },
						]}
					/>
				);
			default:
				return null;
		}
	})();

	return <FormProvider {...methods}>{formFields}</FormProvider>;
}

type WidgetWithSettings = Extract<
	(typeof ALL_WIDGETS)[number],
	{ schema: unknown }
>;

function getWidgetSchema(widgetId: string) {
	const widget = ALL_WIDGETS.find((w) => w.id === widgetId);
	if (widget && "schema" in widget) {
		return widget.schema;
	}
	return null;
}
