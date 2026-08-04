import { Funnel } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { useUser } from "~/features/auth/core/user";
import type { ScrimFilters } from "~/features/scrims/scrims-types";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import { scrimsFiltersFormSchema } from "../scrims-schemas";
import { scrimsSearchParams } from "../scrims-search-params";
import type { LutiDiv } from "../scrims-types";

type FormValues = z.infer<typeof scrimsFiltersFormSchema>;

export function ScrimFiltersDialog({ filters }: { filters: ScrimFilters }) {
	const { t } = useTranslation(["scrims"]);
	const [isOpen, setIsOpen] = React.useState(false);

	return (
		<>
			<SendouButton
				variant="outlined"
				size="small"
				icon={<Funnel />}
				onPress={() => setIsOpen(true)}
				data-testid="filter-scrims-button"
			>
				{t("scrims:filters.button")}
			</SendouButton>
			<SendouDialog
				heading={t("scrims:filters.heading")}
				isOpen={isOpen}
				onClose={() => setIsOpen(false)}
			>
				<FiltersForm
					filters={filters}
					closeDialog={() => {
						setIsOpen(false);
					}}
				/>
			</SendouDialog>
		</>
	);
}

function filtersToFormValues(filters: ScrimFilters): FormValues {
	return {
		weekdayTimes: filters.weekdayTimes,
		weekendTimes: filters.weekendTimes,
		divs: filters.divs ? [filters.divs.max, filters.divs.min] : [null, null],
	};
}

function formValuesToFilters(values: FormValues): ScrimFilters {
	const [max, min] = values.divs ?? [null, null];
	return {
		weekdayTimes: values.weekdayTimes,
		weekendTimes: values.weekendTimes,
		divs:
			max || min
				? { max: max as LutiDiv | null, min: min as LutiDiv | null }
				: null,
	};
}

function FiltersForm({
	filters,
	closeDialog,
}: {
	filters: ScrimFilters;
	closeDialog: () => void;
}) {
	const user = useUser();
	const { t } = useTranslation(["scrims"]);
	const [, setSearchParams] = useSearchParamsTyped(scrimsSearchParams);

	const defaultValues = filtersToFormValues(filters);

	const handleApply = (values: FormValues) => {
		setSearchParams({ filters: formValuesToFilters(values) });
		closeDialog();
	};

	return (
		<SendouForm
			schema={scrimsFiltersFormSchema}
			defaultValues={defaultValues}
			onApply={handleApply}
			submitButtonText={t("scrims:filters.apply")}
			className="stack md-plus items-start"
			secondarySubmit={user ? <ApplyAndPersistButton /> : null}
		>
			{({ FormField }) => (
				<>
					<FormField name="weekdayTimes" />
					<FormField name="weekendTimes" />
					<FormField name="divs" />
				</>
			)}
		</SendouForm>
	);
}

function ApplyAndPersistButton() {
	const { t } = useTranslation(["scrims"]);
	const { values, submitToServer, fetcherState } = useFormFieldContext();

	const handlePress = () => {
		submitToServer({
			_action: "PERSIST_SCRIM_FILTERS",
			filters: formValuesToFilters(values as FormValues),
		});
	};

	return (
		<SendouButton
			variant="outlined"
			onPress={handlePress}
			isDisabled={fetcherState !== "idle"}
		>
			{t("scrims:filters.applyAndDefault")}
		</SendouButton>
	);
}
