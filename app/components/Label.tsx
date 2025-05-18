import clsx from "clsx";

type LabelProps = Pick<
	React.DetailedHTMLProps<
		React.LabelHTMLAttributes<HTMLLabelElement>,
		HTMLLabelElement
	>,
	"children" | "htmlFor"
> & {
	valueLimits?: {
		current: number;
		max: number;
	};
	required?: boolean;
	className?: string;
	labelClassName?: string;
	spaced?: boolean;
};

export function Label({
	valueLimits,
	required,
	children,
	htmlFor,
	className,
	labelClassName,
	spaced = true,
}: LabelProps) {
	return (
		<div className={clsx("label__container", className, { "mb-0": !spaced })}>
			<label htmlFor={htmlFor} className={labelClassName}>
				{children} {required && <span className="text-error">*</span>}
			</label>
			{valueLimits ? (
				<div className={clsx("label__value", lengthWarning(valueLimits))}>
					{valueLimits.current}/{valueLimits.max}
				</div>
			) : null}
		</div>
	);
}

function lengthWarning(valueLimits: NonNullable<LabelProps["valueLimits"]>) {
	if (valueLimits.current > valueLimits.max) return "error";
	if (valueLimits.current / valueLimits.max >= 0.9) return "warning";

	return;
}
