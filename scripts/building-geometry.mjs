import { Vector3 } from "three";
export function planeDeviation(points) {
  if (points.length < 4) return 0;
  const a = new Vector3(...points[0]);
  let normal = new Vector3();
  for (let i = 1; i < points.length - 1; i++) {
    normal.crossVectors(
      new Vector3(...points[i]).sub(a),
      new Vector3(...points[i + 1]).sub(a),
    );
    if (normal.lengthSq() > 1e-16) break;
  }
  if (normal.lengthSq() < 1e-16) return 0;
  normal.normalize();
  return Math.max(
    ...points.map((p) => Math.abs(new Vector3(...p).sub(a).dot(normal))),
  );
}
/** Positional welding is scoped to authored solids, so touching joinery is not
 * falsely diagnosed as one nonmanifold shell. UV seams remain separate in GLBs. */
export function auditGeometry(
  geometry,
  { uvUp = false, requireUV = true } = {},
) {
  const p = geometry.getAttribute("position"),
    n = geometry.getAttribute("normal"),
    uv = geometry.getAttribute("uv");
  const part =
    geometry.getAttribute("_part_id") ?? geometry.getAttribute("_PART_ID");
  const index = geometry.index,
    count = index?.count ?? p.count;
  const ids = new Map(),
    edges = new Map(),
    faceEdges = [],
    volumes = [];
  const result = {
    triangles: count / 3,
    degenerate: 0,
    windingConflicts: 0,
    boundaryEdges: 0,
    nonManifoldEdges: 0,
    inwardComponents: 0,
    normalDisagreements: 0,
    missingUV: uv || !requireUV ? 0 : 1,
    untexturedPrimitives: requireUV ? 0 : 1,
    collapsedUV: 0,
    reversedUV: 0,
  };
  const weld = (i) => {
    const key = `${part ? Math.round(part.getX(i)) : 0}:${[p.getX(i), p.getY(i), p.getZ(i)].map((v) => Math.round(v * 1e5)).join(",")}`;
    if (!ids.has(key)) ids.set(key, ids.size);
    return ids.get(key);
  };
  for (let k = 0; k < count; k += 3) {
    const ix = [0, 1, 2].map((j) => (index ? index.getX(k + j) : k + j)),
      wi = ix.map(weld);
    const [a, b, c] = ix.map((i) => new Vector3().fromBufferAttribute(p, i));
    const cross = new Vector3().crossVectors(
      b.clone().sub(a),
      c.clone().sub(a),
    );
    if (cross.lengthSq() < 1e-18) result.degenerate++;
    if (
      n &&
      cross.dot(
        ix.reduce(
          (sum, i) => sum.add(new Vector3().fromBufferAttribute(n, i)),
          new Vector3(),
        ),
      ) < -1e-8
    )
      result.normalDisagreements++;
    if (uv) {
      const du1 = uv.getX(ix[1]) - uv.getX(ix[0]),
        dv1 = uv.getY(ix[1]) - uv.getY(ix[0]),
        du2 = uv.getX(ix[2]) - uv.getX(ix[0]),
        dv2 = uv.getY(ix[2]) - uv.getY(ix[0]);
      const det = du1 * dv2 - du2 * dv1;
      if (Math.abs(det) < 1e-12) result.collapsedUV++;
      if (
        uvUp &&
        Math.abs(det) > 1e-12 &&
        Math.abs(cross.clone().normalize().y) < 0.2
      ) {
        const tangentV = c
          .clone()
          .sub(a)
          .multiplyScalar(du1)
          .sub(b.clone().sub(a).multiplyScalar(du2))
          .divideScalar(det);
        if (tangentV.y < -0.001) result.reversedUV++;
      }
    }
    const fe = [];
    for (let j = 0; j < 3; j++) {
      const x = wi[j],
        y = wi[(j + 1) % 3],
        key = x < y ? `${x}:${y}` : `${y}:${x}`;
      const list = edges.get(key) ?? [];
      list.push({ face: k / 3, direction: x < y ? 1 : -1 });
      edges.set(key, list);
      fe.push(key);
    }
    faceEdges.push(fe);
    volumes.push(a.dot(new Vector3().crossVectors(b, c)) / 6);
  }
  for (const list of edges.values()) {
    if (list.length === 1) result.boundaryEdges++;
    else if (list.length > 2) result.nonManifoldEdges++;
    else if (list[0].direction === list[1].direction) result.windingConflicts++;
  }
  const remaining = new Set(faceEdges.map((_, i) => i));
  while (remaining.size) {
    const first = remaining.values().next().value;
    remaining.delete(first);
    const stack = [first];
    let volume = 0,
      closed = true;
    while (stack.length) {
      const f = stack.pop();
      volume += volumes[f];
      for (const key of faceEdges[f]) {
        const list = edges.get(key);
        if (list.length !== 2) closed = false;
        for (const e of list) if (remaining.delete(e.face)) stack.push(e.face);
      }
    }
    if (closed && volume < -1e-8) result.inwardComponents++;
  }
  return result;
}
