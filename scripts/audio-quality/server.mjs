import http from "node:http";
import fs from "node:fs";
import {
  ROOT,
  OUTPUT,
  readJSON,
  writeJSON,
  validateAssessment,
} from "./core.mjs";
const scoresPath = `${ROOT}/assessments.json`;
const port = Number(process.env.AUDIO_REVIEW_PORT || 5174);
const server = http.createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const url = new URL(req.url, "http://localhost");
  const send = (status, data, type = "application/json") => {
    res.writeHead(status, { "Content-Type": type });
    res.end(type === "application/json" ? JSON.stringify(data) : data);
  };
  try {
    if (req.method === "GET" && url.pathname === "/")
      return send(
        200,
        fs.readFileSync("scripts/audio-quality/review.html"),
        "text/html; charset=utf-8",
      );
    const review = readJSON(`${OUTPUT}/review.json`);
    const scores = fs.existsSync(scoresPath) ? readJSON(scoresPath) : {};
    if (req.method === "GET" && url.pathname === "/api/review")
      return send(200, {
        ...review,
        items: review.items.map(({ file, master, ...item }) => ({
          ...item,
          url: `/media/${encodeURIComponent(item.id)}`,
          assessment: scores[item.id],
          evaluation: validateAssessment(scores[item.id], item, review.rubric),
        })),
      });
    if (req.method === "GET" && url.pathname.startsWith("/media/")) {
      const item = review.items.find(
        (i) => i.id === decodeURIComponent(url.pathname.slice(7)),
      );
      if (!item) return send(404, { error: "Unknown audition" });
      const stat = fs.statSync(item.file);
      res.setHeader("Accept-Ranges", "bytes");
      const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
      const start = match ? Number(match[1]) : 0,
        end =
          match && match[2]
            ? Math.min(Number(match[2]), stat.size - 1)
            : stat.size - 1;
      if (start > end || start >= stat.size)
        return send(416, { error: "Invalid range" });
      res.writeHead(match ? 206 : 200, {
        "Content-Type": "audio/wav",
        "Content-Length": end - start + 1,
        ...(match
          ? { "Content-Range": `bytes ${start}-${end}/${stat.size}` }
          : {}),
      });
      fs.createReadStream(item.file, { start, end }).pipe(res);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/scores") {
      if (
        req.headers.origin !== `http://${req.headers.host}` ||
        !req.headers["content-type"]?.startsWith("application/json")
      )
        return send(403, { error: "Same-origin JSON requests required" });
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 32768)
          return send(413, { error: "Scorecard too large" });
      }
      const value = JSON.parse(body),
        item = review.items.find((i) => i.id === value.id);
      if (!item) return send(400, { error: "Unknown audition" });
      const assessment = {
        reviewer: value.reviewer,
        notes: value.notes,
        scores: value.scores,
        criticalDefect: !!value.criticalDefect,
        rubric: value.rubric,
        evidenceHash: value.evidenceHash,
        reviewedAt: new Date().toISOString(),
      };
      const result = validateAssessment(assessment, item, review.rubric);
      if (result.status === "unreviewed")
        return send(400, { error: result.reason });
      scores[item.id] = assessment;
      writeJSON(scoresPath, scores);
      return send(200, result);
    }
    send(404, { error: "Not found" });
  } catch (error) {
    console.error(error.message);
    send(500, { error: "Review unavailable; inspect local server output" });
  }
});
server.listen(port, "0.0.0.0", () =>
  console.log(`Audio audition: http://localhost:${port}`),
);
