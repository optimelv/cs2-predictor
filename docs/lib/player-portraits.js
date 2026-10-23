// Portraits are deliberately limited to identified Tier 1 players with a
// reusable Commons license. Keep the source and attribution beside each file.
const PORTRAITS = {
  "hltv:21167": {
    src: "https://img-cdn.hltv.org/playerbodyshot/xVbHhluSLk5eWQqcYL-bBY.png?ixlib=java-2.1.0&s=8e517263589f06013ef1459fe040ec82&w=400",
    fallbackSrc: "./assets/players/donk.jpg",
    author: "TS.BigFARGO",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Team_spirit_19.01.202531303_%D0%BA%D0%BE%D0%BF%D0%B8%D1%8F_(cropped).jpg",
  },
  "hltv:11893": {
    src: "https://img-cdn.hltv.org/playerbodyshot/blnoWFtH8GUJZjhr8H0P4u.png?ixlib=java-2.1.0&s=dc0fe6bd817ef852f59185ccf6b6c868&w=400",
    fallbackSrc: "./assets/players/zywoo.jpg",
    author: "VaKarM.net",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Zywoo_2022_(cropped).jpg",
  },
  "hltv:19230": {
    src: "https://img-cdn.hltv.org/playerbodyshot/Xn6RSL5KIFiD6hXiBseskM.png?ixlib=java-2.1.0&s=f65656a3af86ed20f055cc25e35dc8e9&w=400",
    fallbackSrc: "./assets/players/m0nesy.png",
    author: "G2 Esports",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:M0nesy.png",
  },
  "hltv:16693": {
    src: "https://img-cdn.hltv.org/playerbodyshot/LUQi5dX9boyO0uDadUGht5.png?ixlib=java-2.1.0&s=1c5c46fe41e79b19a69b479d8abbbb41&w=400",
    fallbackSrc: "./assets/players/flamez.jpg",
    author: "VaKarM.net",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:FlameZ_2024.jpg",
    position: "58% center",
  },
  "hltv:11816": {
    src: "https://img-cdn.hltv.org/playerbodyshot/YQ9kQQ3aop1JZQE9xJ140r.png?ixlib=java-2.1.0&s=d4c7a00036511e25b4854ba3d3af80ca&w=400",
    fallbackSrc: "./assets/players/ropz.jpg",
    author: "VaKarM.net",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Ropz_at_Blast_Paris_Major_2023_(cropped).jpg",
  },
  "hltv:13776": {
    src: "https://img-cdn.hltv.org/playerbodyshot/poatsoxwv_ne6Col6VJLg7.png?ixlib=java-2.1.0&s=e497d659582a13880c16cd55a6fe6847&w=400",
    fallbackSrc: "./assets/players/jame.jpg",
    author: "Ricco Baroni",
    license: "CC0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Jame_with_the_Parivision.jpg",
  },
  "hltv:3741": {
    src: "https://img-cdn.hltv.org/playerbodyshot/ZPB6zop8FumkqqbHl8BGos.png?ixlib=java-2.1.0&s=a81b4da0555bb1f3599bd3ca854f5515&w=400",
    fallbackSrc: "./assets/players/niko.png",
    author: "G2 Esports",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:NiKo_2022.png",
  },
  "hltv:7938": {
    src: "https://img-cdn.hltv.org/playerbodyshot/9zPNSNo_4XxREmOgFhVWY8.png?ixlib=java-2.1.0&s=921783f5c5bd3d054acef1f62eb92dd5&w=400",
    fallbackSrc: "./assets/players/xantares.jpg",
    author: "BIG CLAN",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Xantares_in_2020.jpg",
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
