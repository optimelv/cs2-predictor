// Portraits are deliberately limited to identified Tier 1 players with a
// reusable Commons license. Keep the source and attribution beside each file.
const PORTRAITS = {
  "hltv:21167": {
    src: "https://img-cdn.hltv.org/playerbodyshot/xVbHhluSLk5eWQqcYL-bBY.png?ixlib=java-2.1.0&s=8e517263589f06013ef1459fe040ec82&w=400",
    fallbackSrc: "./assets/players/donk.jpg",
    sourceUrl: "https://www.hltv.org/player/21167/donk",
    creditLabel: "HLTV profile image",
  },
  "hltv:11893": {
    src: "https://img-cdn.hltv.org/playerbodyshot/blnoWFtH8GUJZjhr8H0P4u.png?ixlib=java-2.1.0&s=dc0fe6bd817ef852f59185ccf6b6c868&w=400",
    fallbackSrc: "./assets/players/zywoo.jpg",
    sourceUrl: "https://www.hltv.org/player/11893/zywoo",
    creditLabel: "HLTV profile image",
  },
  "hltv:19230": {
    src: "https://img-cdn.hltv.org/playerbodyshot/Xn6RSL5KIFiD6hXiBseskM.png?ixlib=java-2.1.0&s=f65656a3af86ed20f055cc25e35dc8e9&w=400",
    fallbackSrc: "./assets/players/m0nesy.png",
    sourceUrl: "https://www.hltv.org/player/19230/m0nesy",
    creditLabel: "HLTV profile image",
  },
  "hltv:16693": {
    src: "https://img-cdn.hltv.org/playerbodyshot/LUQi5dX9boyO0uDadUGht5.png?ixlib=java-2.1.0&s=1c5c46fe41e79b19a69b479d8abbbb41&w=400",
    fallbackSrc: "./assets/players/flamez.jpg",
    sourceUrl: "https://www.hltv.org/player/16693/flamez",
    creditLabel: "HLTV profile image",
    position: "58% center",
  },
  "hltv:11816": {
    src: "https://img-cdn.hltv.org/playerbodyshot/YQ9kQQ3aop1JZQE9xJ140r.png?ixlib=java-2.1.0&s=d4c7a00036511e25b4854ba3d3af80ca&w=400",
    fallbackSrc: "./assets/players/ropz.jpg",
    sourceUrl: "https://www.hltv.org/player/11816/ropz",
    creditLabel: "HLTV profile image",
  },
  "hltv:13776": {
    src: "https://img-cdn.hltv.org/playerbodyshot/poatsoxwv_ne6Col6VJLg7.png?ixlib=java-2.1.0&s=e497d659582a13880c16cd55a6fe6847&w=400",
    fallbackSrc: "./assets/players/jame.jpg",
    sourceUrl: "https://www.hltv.org/player/13776/jame",
    creditLabel: "HLTV profile image",
  },
  "hltv:3741": {
    src: "https://img-cdn.hltv.org/playerbodyshot/ZPB6zop8FumkqqbHl8BGos.png?ixlib=java-2.1.0&s=a81b4da0555bb1f3599bd3ca854f5515&w=400",
    fallbackSrc: "./assets/players/niko.png",
    sourceUrl: "https://www.hltv.org/player/3741/niko",
    creditLabel: "HLTV profile image",
  },
  "hltv:7938": {
    src: "https://img-cdn.hltv.org/playerbodyshot/9zPNSNo_4XxREmOgFhVWY8.png?ixlib=java-2.1.0&s=921783f5c5bd3d054acef1f62eb92dd5&w=400",
    fallbackSrc: "./assets/players/xantares.jpg",
    sourceUrl: "https://www.hltv.org/player/7938/xantares",
    creditLabel: "HLTV profile image",
  },
};

function currentHltvPortrait(player) {
  const url = String(player?.portrait_url || "").trim();
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "img-cdn.hltv.org" && parsed.pathname.startsWith("/playerbodyshot/")
      ? { src: url, sourceUrl: player.source_url, author: "HLTV", license: "Current profile image", licenseUrl: player.source_url }
      : null;
  } catch {
    return null;
  }
}

export function playerPortraitFor(player) {
  const profile = typeof player === "object" && player ? player : null;
  return PORTRAITS[String(profile?.player_id || player)] || currentHltvPortrait(profile);
}
