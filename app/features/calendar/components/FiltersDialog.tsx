import { zodResolver } from "@hookform/resolvers/zod";
import { useFetcher, useSearchParams } from "@remix-run/react";
import * as React from "react";
import { FormProvider, useForm } from "react-hook-form";
import { SubmitButton } from "~/components/SubmitButton";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { ToggleFormField } from "~/components/form/ToggleFormField";
import { FilterIcon } from "~/components/icons/Filter";
import { calendarFiltersSchema } from "~/features/calendar/calendar-schemas";
import type { CalendarFilters } from "~/features/calendar/calendar-types";

export function FiltersDialog({ filters }: { filters: CalendarFilters }) {
	const [isOpen, setIsOpen] = React.useState(false);

	return (
		<>
			<SendouButton
				variant="outlined"
				size="small"
				icon={<FilterIcon />}
				onClick={() => setIsOpen(true)}
			>
				Filter
			</SendouButton>
			<SendouDialog
				heading="Filter calendar events"
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
}: { filters: CalendarFilters; closeDialog: () => void }) {
	const methods = useForm({
		resolver: zodResolver(calendarFiltersSchema),
		defaultValues: filters,
	});
	const fetcher = useFetcher<any>();
	const [, setSearchParams] = useSearchParams();

	const filtersToSearchParams = (newFilters: CalendarFilters) => {
		setSearchParams((prev) => {
			for (const [key, value] of Object.entries(newFilters)) {
				if (value === null || value === undefined) {
					prev.delete(key);
				} else {
					prev.set(key, value.toString());
				}
			}
			return prev;
		});
	};

	const onSubmit = React.useCallback(
		methods.handleSubmit((values) => {
			filtersToSearchParams(values);
			closeDialog();
		}),
		[],
	);

	return (
		<FormProvider {...methods}>
			<fetcher.Form className="stack md-plus items-start" onSubmit={onSubmit}>
				<ToggleFormField<CalendarFilters>
					label="Only events hosted on sendou.ink"
					name={"onlySendouHosted" as const}
				/>

				<div className="stack horizontal md justify-center mt-6 w-full">
					<SubmitButton state={fetcher.state}>Apply</SubmitButton>
					<SendouButton variant="outlined">Apply & make default</SendouButton>
				</div>
			</fetcher.Form>
		</FormProvider>
	);
}
