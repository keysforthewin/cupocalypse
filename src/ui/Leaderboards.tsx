import { useEffect, useState } from "react";
import type { Mode } from "../game/types";
import {
  fetchLeaderboards,
  type Leaderboards as Boards,
} from "../game/leaderboard";

export function Leaderboards({
  mode,
  revision = 0,
  playerId,
}: {
  mode: Mode;
  revision?: number;
  playerId: string;
}) {
  const [boards, setBoards] = useState<Boards | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const data = await fetchLeaderboards(
          mode,
          AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        );
        if (!controller.signal.aborted) {
          setBoards(data);
          setError(false);
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    };
    void refresh();
    const timer = setInterval(refresh, 30000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [mode, revision, retry]);
  return (
    <section className="leaderboards" aria-label="Shared leaderboards">
      <div className="leaderboard-heading">
        <span className="eyebrow">GUILD HALL OF FAME</span>
        <span>TOP 10 · {mode.toUpperCase()}</span>
      </div>
      {error && (
        <p role="status" className="leaderboard-status">
          {boards
            ? "Showing last loaded scores. "
            : "Shared scores are unavailable. "}
          <button onClick={() => setRetry((n) => n + 1)}>RETRY</button>
        </p>
      )}
      {!boards && !error && <p role="status">Loading shared scores…</p>}
      <h3>DISTANCE</h3>
      <table aria-label="Top 10 by distance">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">PLAYER</th>
            <th scope="col">METERS</th>
          </tr>
        </thead>
        <tbody>
          {boards?.distance.map((entry, i) => (
            <tr
              key={entry.playerId}
              className={entry.playerId === playerId ? "your-score" : ""}
            >
              <td>{String(i + 1).padStart(2, "0")}</td>
              <td title={entry.name}>
                <span>{entry.name}</span>
              </td>
              <td>{entry.distance.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {boards && boards.distance.length === 0 && (
        <p className="leaderboard-empty">
          No scores yet for {mode}. Set the first record.
        </p>
      )}
      <p className="leaderboard-note">Each player’s furthest run in {mode}.</p>
    </section>
  );
}
