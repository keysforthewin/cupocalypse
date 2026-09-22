import { useEffect, useState } from "react";
import {
  fetchLeaderboards,
  type Leaderboards as Boards,
} from "../game/leaderboard";

export function Leaderboards({
  revision = 0,
  playerId,
}: {
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
  }, [revision, retry]);
  return (
    <section className="leaderboards" aria-label="Shared leaderboards">
      <div className="leaderboard-heading">
        <span className="eyebrow">GUILD HALL OF FAME</span>
        <span>TOP 10 · ALL PROTOCOLS</span>
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
      <div className="leaderboard-columns">
        {(["distance", "kills"] as const).map((metric) => (
          <div key={metric}>
            <h3>
              {metric === "distance"
                ? "FURTHEST DISTANCE"
                : "MOST ELIMINATIONS"}
            </h3>
            <table
              aria-label={
                metric === "distance"
                  ? "Top 10 by distance"
                  : "Top 10 by kill count"
              }
            >
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">PLAYER</th>
                  <th scope="col">
                    {metric === "distance" ? "METERS" : "KILLS"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {boards?.[metric].map((entry, i) => (
                  <tr
                    key={entry.playerId}
                    className={entry.playerId === playerId ? "your-score" : ""}
                  >
                    <td>{String(i + 1).padStart(2, "0")}</td>
                    <td title={`${entry.name} · ${entry.mode}`}>
                      <span>{entry.name}</span>
                    </td>
                    <td>{entry[metric].toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {boards && boards[metric].length === 0 && (
              <p className="leaderboard-empty">
                No scores yet. Set the first record.
              </p>
            )}
          </div>
        ))}
      </div>
      <p className="leaderboard-note">
        Each player’s best run in each category.
      </p>
    </section>
  );
}
