import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useFetcher, useSearchParams } from "@remix-run/react";
import * as React from "react";
import { FormProvider, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { FilterFilledIcon } from "~/components/icons/FilterFilled";
import { SubmitButton } from "~/components/SubmitButton";
import { useUser } from "~/features/auth/core/user";
import type { ScrimFilters } from "~/features/scrims/scrims-types";
import { scrimsFiltersSchema } from "../scrims-schemas";
import { LutiDivsFormField } from "./LutiDivsFormField";
import { TimeRangeFormField } from "./TimeRangeFormField";

export function ScrimFiltersDialog({ filters }: { filters: ScrimFilters }) {
	const { t } = useTranslation(["scrims"]);
	const [isOpen, setIsOpen] = React.useState(false);

	return (
		<>
			<SendouButton
				variant="outlined"
				size="small"
				icon={<FilterFilledIcon />}
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

function FiltersForm({
	filters,
	closeDialog,
}: {
	filters: ScrimFilters;
	closeDialog: () => void;
}) {
	const user = useUser();
	const { t } = useTranslation(["scrims"]);

	const methods = useForm({
		resolver: standardSchemaResolver(scrimsFiltersSchema),
		defaultValues: filters,
	});
	const fetcher = useFetcher<any>();
	const [, setSearchParams] = useSearchParams();

	const filtersToSearchParams = (newFilters: ScrimFilters) => {
		setSearchParams((prev) => {
			prev.set("filters", JSON.stringify(newFilters));
			return prev;
		});
	};

	const onApply = React.useCallback(
		methods.handleSubmit((values) => {
			filtersToSearchParams(values as ScrimFilters);
			closeDialog();
		}),
		[],
	);

	const onApplyAndPersist = React.useCallback(
		methods.handleSubmit((values) =>
			fetcher.submit(
				// @ts-expect-error TODO: fix
				{
					_action: "PERSIST_SCRIM_FILTERS",
					filters: values as Parameters<typeof fetcher.submit>[0],
				},
				{
					method: "post",
					encType: "application/json",
				},
			),
		),
		[],
	);

	return (
		<FormProvider {...methods}>
			<fetcher.Form
				className="stack md-plus items-start"
				onSubmit={onApplyAndPersist}
			>
				<input type="hidden" name="_action" value="PERSIST_SCRIM_FILTERS" />
				<TimeRangeFormField<ScrimFilters>
					label={t("scrims:filters.weekdayTimes")}
					name={"weekdayTimes" as const}
				/>

				<TimeRangeFormField<ScrimFilters>
					label={t("scrims:filters.weekendTimes")}
					name={"weekendTimes" as const}
				/>

				<LutiDivsFormField />

				<div className="stack horizontal md justify-center mt-6 w-full">
					<SendouButton onPress={() => onApply()}>
						{t("scrims:filters.apply")}
					</SendouButton>
					{user ? (
						<SubmitButton variant="outlined" state={fetcher.state}>
							{t("scrims:filters.applyAndDefault")}
						</SubmitButton>
					) : null}
				</div>
			</fetcher.Form>
		</FormProvider>
	);
}
