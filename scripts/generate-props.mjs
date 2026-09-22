import { run } from "./generate.mjs";
const name = "wreck-truck";
const reference = await run(
  name + "-reference",
  "fal-ai/flux/dev",
  {
    prompt:
      "One abandoned wrecked modern olive military transport truck, full vehicle isolated on plain light gray studio background, front three-quarter view, six heavy tires, dirty canvas cargo cover torn at corners, cracked windshield, dented metal, realistic military quarantine checkpoint prop, weathered PBR surface detail, realistic video game asset, no scene, no text.",
    image_size: "square_hd",
    num_images: 1,
  },
  0.1,
);
await run(
  name + "-mesh",
  "fal-ai/trellis",
  { image_url: reference.images[0].url },
  2,
);
