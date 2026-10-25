// Portraits use current, explicitly verified HLTV profile images. Never derive opaque CDN tokens.
const PORTRAITS = {
  "hltv:21167": {
    src: "https://img-cdn.hltv.org/playerbodyshot/xVbHhluSLk5eWQqcYL-bBY.png?ixlib=java-2.1.0&s=8e517263589f06013ef1459fe040ec82&w=400",
    sourceUrl: "https://www.hltv.org/player/21167/donk",
    creditLabel: "HLTV profile image",
  },
  "hltv:11893": {
    src: "https://img-cdn.hltv.org/playerbodyshot/blnoWFtH8GUJZjhr8H0P4u.png?ixlib=java-2.1.0&s=dc0fe6bd817ef852f59185ccf6b6c868&w=400",
    sourceUrl: "https://www.hltv.org/player/11893/zywoo",
    creditLabel: "HLTV profile image",
  },
  "hltv:19230": {
    src: "https://img-cdn.hltv.org/playerbodyshot/Xn6RSL5KIFiD6hXiBseskM.png?ixlib=java-2.1.0&s=f65656a3af86ed20f055cc25e35dc8e9&w=400",
    sourceUrl: "https://www.hltv.org/player/19230/m0nesy",
    creditLabel: "HLTV profile image",
  },
  "hltv:16693": {
    src: "https://img-cdn.hltv.org/playerbodyshot/LUQi5dX9boyO0uDadUGht5.png?ixlib=java-2.1.0&s=1c5c46fe41e79b19a69b479d8abbbb41&w=400",
    sourceUrl: "https://www.hltv.org/player/16693/flamez",
    creditLabel: "HLTV profile image",
    position: "center top",
  },
  "hltv:11816": {
    src: "https://img-cdn.hltv.org/playerbodyshot/YQ9kQQ3aop1JZQE9xJ140r.png?ixlib=java-2.1.0&s=d4c7a00036511e25b4854ba3d3af80ca&w=400",
    sourceUrl: "https://www.hltv.org/player/11816/ropz",
    creditLabel: "HLTV profile image",
  },
  "hltv:13776": {
    src: "https://img-cdn.hltv.org/playerbodyshot/poatsoxwv_ne6Col6VJLg7.png?ixlib=java-2.1.0&s=e497d659582a13880c16cd55a6fe6847&w=400",
    sourceUrl: "https://www.hltv.org/player/13776/jame",
    creditLabel: "HLTV profile image",
  },
  "hltv:3741": {
    src: "https://img-cdn.hltv.org/playerbodyshot/ZPB6zop8FumkqqbHl8BGos.png?ixlib=java-2.1.0&s=a81b4da0555bb1f3599bd3ca854f5515&w=400",
    sourceUrl: "https://www.hltv.org/player/3741/niko",
    creditLabel: "HLTV profile image",
  },
  "hltv:7938": {
    src: "https://img-cdn.hltv.org/playerbodyshot/9zPNSNo_4XxREmOgFhVWY8.png?ixlib=java-2.1.0&s=921783f5c5bd3d054acef1f62eb92dd5&w=400",
    sourceUrl: "https://www.hltv.org/player/7938/xantares",
    creditLabel: "HLTV profile image",
  },
  "hltv:16920": {
    src: "https://img-cdn.hltv.org/playerbodyshot/KrsTmqu-PCTaMrChcomGkg.png?ixlib=java-2.1.0&s=967fd451428681f693675db991bdf6c2&w=400",
    sourceUrl: "https://www.hltv.org/player/16920/sh1ro",
    creditLabel: "HLTV profile image",
  },
  "hltv:7322": {
    src: "https://img-cdn.hltv.org/playerbodyshot/3M9h08qvl3YOsaRcAvKhs4.png?ixlib=java-2.1.0&s=c1acc9777d9e3165140548582e9bf1f5&w=400",
    sourceUrl: "https://www.hltv.org/player/7322/apex",
    creditLabel: "HLTV profile image",
  },
  "hltv:18462": {
    src: "https://img-cdn.hltv.org/playerbodyshot/7GVUrVLAQkgnuovRkk5Bxw.png?ixlib=java-2.1.0&s=00b346853396c35e5889b00be2766c99&w=400",
    sourceUrl: "https://www.hltv.org/player/18462/mezii",
    creditLabel: "HLTV profile image",
  },
  "hltv:18987": {
    src: "https://img-cdn.hltv.org/playerbodyshot/CgO3veixSYH5OMIePtwp1u.png?ixlib=java-2.1.0&s=1b5f0f326bf822540d59ae246c1b7e65&w=400",
    sourceUrl: "https://www.hltv.org/player/18987/b1t",
    creditLabel: "HLTV profile image",
  },
  "hltv:9960": {
    src: "https://img-cdn.hltv.org/playerbodyshot/aFuk-1yq3DatdhVa3kICms.png?ixlib=java-2.1.0&s=4a99190a6e6eabbfd799ec121c5f9c53&w=400",
    sourceUrl: "https://www.hltv.org/player/9960/frozen",
    creditLabel: "HLTV profile image",
  },
  "hltv:18072": {
    src: "https://img-cdn.hltv.org/playerbodyshot/g9uOgg5eleoDQBL3oISgCU.png?ixlib=java-2.1.0&s=c2e49b3335e46e1f0ad6ee145563b566&w=400",
    sourceUrl: "https://www.hltv.org/player/18072/torzsi",
    creditLabel: "HLTV profile image",
  },
  "hltv:20312": {
    src: "https://img-cdn.hltv.org/playerbodyshot/d27M8GVSaQYgRfmBJnBpkE.png?ixlib=java-2.1.0&s=aff5b6409249a3c87412e15c4e7ea4e2&w=400",
    sourceUrl: "https://www.hltv.org/player/20312/xertion",
    creditLabel: "HLTV profile image",
  },
  "hltv:18850": {
    src: "https://img-cdn.hltv.org/playerbodyshot/YV17JXjtrMTI4G0LULROlE.png?ixlib=java-2.1.0&s=429021ee8e8ce7cfced630caa82ea4a2&w=400",
    sourceUrl: "https://www.hltv.org/player/18850/jimpphat",
    creditLabel: "HLTV profile image",
  },
  "hltv:20127": { src: "https://img-cdn.hltv.org/playerbodyshot/OepRRBoc68iVojIfgK3JIA.png?ixlib=java-2.1.0&s=99dcc1115ffec1ed275a5cf4eacca825&w=400", sourceUrl: "https://www.hltv.org/player/20127/w0nderful", creditLabel: "HLTV profile image" },
  "hltv:8183": { src: "https://img-cdn.hltv.org/playerbodyshot/oO0Eu3frIZSJrQZeC501Zm.png?ixlib=java-2.1.0&s=b8aa24aa5e6bc2a87e46cccc9f4c422b&w=400", sourceUrl: "https://www.hltv.org/player/8183/rain", creditLabel: "HLTV profile image" },
  "hltv:7592": { src: "https://img-cdn.hltv.org/playerbodyshot/TE9xSRwRif78uNjfN9VxSY.png?ixlib=java-2.1.0&s=2051fe1f1e664c8ab005e44e9dc8fd8e&w=400", sourceUrl: "https://www.hltv.org/player/7592/device", creditLabel: "HLTV profile image" },
  "hltv:9436": { src: "https://img-cdn.hltv.org/playerbodyshot/6NpXCWi632T7Ne7nO372ql.png?ixlib=java-2.1.0&s=a26996dd9356580421735171da527435&w=400", sourceUrl: "https://www.hltv.org/player/9436/nertz", creditLabel: "HLTV profile image" },
};

function currentHltvPortrait(player) {
  const id = String(player?.player_id || "").match(/^hltv:(\d+)$/)?.[1];
  const url = String(player?.portrait_url || "").trim();
  try {
    const image = new URL(url);
    const safeImage = image.protocol === "https:" && image.hostname === "img-cdn.hltv.org" && !image.port && !image.username && !image.password && /^\/(?:playerbodyshot|gallerypicture)\//.test(image.pathname);
    if (!id || !safeImage) return null;
    let sourceUrl = `https://www.hltv.org/player/${id}`;
    try {
      const source = new URL(String(player?.source_url || ""));
      if (source.protocol === "https:" && source.hostname === "www.hltv.org" && !source.port && !source.username && !source.password && source.pathname.startsWith(`/player/${id}/`)) sourceUrl = source.href;
    } catch {
      // A current image remains safe to show; credit its canonical profile when a lineup lacks source_url.
    }
    return { src: image.href, sourceUrl, creditLabel: "HLTV profile image" };
  } catch {
    return null;
  }
}

export function playerPortraitFor(player) {
  const profile = typeof player === "object" && player ? player : null;
  return currentHltvPortrait(profile) || PORTRAITS[String(profile?.player_id || player)] || null;
}
