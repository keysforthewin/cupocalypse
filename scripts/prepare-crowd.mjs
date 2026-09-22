import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { compactPrimitive } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
const doc = await io.read("public/assets/runtime/soldier-static-lod.glb");
let before = 0,
  after = 0;
for (const mesh of doc.getRoot().listMeshes())
  for (const prim of mesh.listPrimitives()) {
    const index = prim.getIndices();
    const positions = prim.getAttribute("POSITION").getArray();
    before += index.getCount() / 3;
    const [indices] = MeshoptSimplifier.simplifySloppy(
      new Uint32Array(index.getArray()),
      positions,
      3,
      null,
      750 * 3,
      0.035,
    );
    index.setArray(new Uint16Array(indices));
    compactPrimitive(prim);
    after += index.getCount() / 3;
  }
await io.write("public/assets/soldier-crowd.glb", doc);
console.log(JSON.stringify({ before, after }));
