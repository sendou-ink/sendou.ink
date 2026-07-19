import { CV_ASSETS_URL } from "~/utils/urls";
import type {
  MinimapData,
  MinimapEnemy,
  MinimapTeammate,
} from "../core/detectors/minimap/index";
import { saveFixtureFromEvent } from "./fixture-export";
import { formatTime } from "./format";
import { mainWeaponLabel, stageLabel } from "./labels";

function AbilityRow({ abilities }: { abilities: (string | null)[] }) {
  return (
    <>
      {abilities.map((id, i) =>
        id ? (
          <img
            key={i}
            className="weapon-icon"
            src={`${CV_ASSETS_URL}/abilities/${id}.png`}
            alt={id}
            title={id}
            style={{ width: 22, height: 22 }}
          />
        ) : (
          <span key={i} title="unreadable badge">
            ?
          </span>
        ),
      )}
    </>
  );
}

function PlayerRow({ label, player }: { label: string; player: MinimapTeammate | MinimapEnemy }) {
  return (
    <tr>
      <td>{label}</td>
      <td>{player.name ?? ""}</td>
      <td>
        {player.weaponId !== null ? (
          <img
            className="weapon-icon"
            src={`${CV_ASSETS_URL}/main-weapons/${player.weaponId}.png`}
            alt={mainWeaponLabel(player.weaponId) ?? String(player.weaponId)}
            title={mainWeaponLabel(player.weaponId) ?? String(player.weaponId)}
          />
        ) : (
          "?"
        )}
      </td>
      <td>
        <AbilityRow abilities={player.abilities} />
      </td>
    </tr>
  );
}

export function MinimapCard(props: {
  t: number;
  confidence: number;
  data: MinimapData;
  thumbnail?: string;
  detectedAt?: number;
  /** lazy loader for the exact analyzed frame — enables fixture export */
  getFrame?: () => Promise<Blob | null | undefined>;
  onInspect?: () => void;
}) {
  const { t, confidence, data, thumbnail, detectedAt, getFrame, onInspect } = props;
  return (
    <div className="card">
      <div className="meta">
        <span>t={formatTime(t)}</span>
        <span className="status detected">minimap</span>
        {data.stage !== null && <span>{stageLabel(data.stage)}</span>}
        <span>confidence {(confidence * 100).toFixed(0)}%</span>
        {detectedAt && <span>{new Date(detectedAt).toLocaleTimeString()}</span>}
        {onInspect && <button onClick={onInspect}>Inspect</button>}
        {getFrame && (
          <button
            onClick={() =>
              void getFrame().then((f) => f && saveFixtureFromEvent(f, data, "Minimap"))
            }
          >
            Save fixture
          </button>
        )}
        {thumbnail && <img className="thumb" src={thumbnail} alt="analyzed frame" />}
      </div>
      <div className="teams">
        <div className="team">
          <table className="players">
            <tbody>
              {data.teammates.map((p) => (
                <PlayerRow key={p.slot} label={p.slot} player={p} />
              ))}
              {data.enemies.map((p, i) => (
                <PlayerRow key={`e${i}`} label={`enemy ${i + 1}`} player={p} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
