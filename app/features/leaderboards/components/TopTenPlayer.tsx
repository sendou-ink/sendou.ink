import clsx from "clsx";
import { Flag } from "~/components/Flag";
import { Image } from "~/components/Image";
import { Placement } from "~/components/Placement";
import invariant from "~/utils/invariant";
import { winnersImageUrl } from "~/utils/urls";
import playerData from "../top-ten.json";

export function TopTenPlayer({
	power,
	placement,
	season,
	small = false,
}: {
	power?: number;
	placement: number;
	season: number;
	small?: boolean;
}) {
	const data = playerData[season]?.[placement - 1];
	invariant(data, `No data for season ${season} and placement ${placement}`);
	const { name, countryCode, transforms } = data;

	const transformMultiplier = small ? 1 / 3 : 1;

	return (
		<div
			className={clsx("stack horizontal items-center text-main-forced", {
				md: !small,
				sm: small,
				"mt-2": small,
			})}
		>
			<div className={clsx("winner__container", { small })}>
				<Image
					path={winnersImageUrl({ season, placement })}
					alt=""
					containerClassName="winner__img-container"
					className="winner__img"
					height={small ? 50 : 150}
					containerStyle={
						{
							"--winner-top": transforms?.top
								? `${transforms.top * transformMultiplier}px`
								: undefined,
							"--winner-left": transforms?.left
								? `${transforms.left * transformMultiplier}px`
								: undefined,
						} as React.CSSProperties
					}
				/>
			</div>
			<div>
				<div
					className="text-xs text-lighter stack horizontal xxs items-center"
					style={placement > 3 ? { marginBlockEnd: "-4px" } : undefined}
				>
					{placement <= 3 ? (
						<Placement placement={placement} size={15} iconClassName="mr-1" />
					) : null}{" "}
					<Placement placement={placement} textOnly showAsSuperscript={false} />{" "}
					place
				</div>
				{!small ? (
					<>
						<div className="text-xl font-semi-bold">
							<Flag tiny countryCode={countryCode} /> {name}
						</div>
						<div className="text-lg font-bold" style={{ lineHeight: "1" }}>
							{power}
						</div>
					</>
				) : null}
			</div>
		</div>
	);
}
