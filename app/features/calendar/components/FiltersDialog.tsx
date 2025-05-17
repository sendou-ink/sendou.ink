import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { FilterIcon } from "~/components/icons/Filter";

export function FiltersDialog() {
	return (
		<SendouDialog
			heading="Apply calendar filters"
			trigger={
				<SendouButton variant="outlined" size="small" icon={<FilterIcon />}>
					Filter
				</SendouButton>
			}
		>
			hey
		</SendouDialog>
	);
}
