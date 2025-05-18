import { Button } from "../Button";
import { TrashIcon } from "../icons/Trash";

export function RemoveFieldButton({ onClick }: { onClick: () => void }) {
	return (
		<Button
			icon={<TrashIcon />}
			aria-label="Remove form field"
			size="tiny"
			variant="minimal-destructive"
			onClick={onClick}
		/>
	);
}
