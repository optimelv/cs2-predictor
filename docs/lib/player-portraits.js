// Portraits are deliberately limited to identified Tier 1 players with a
// reusable Commons license. Keep the source and attribution beside each file.
const PORTRAITS = {
  "hltv:21167": {
    src: "./assets/players/donk.jpg",
    author: "TS.BigFARGO",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Team_spirit_19.01.202531303_%D0%BA%D0%BE%D0%BF%D0%B8%D1%8F_(cropped).jpg",
  },
  "hltv:11893": {
    src: "./assets/players/zywoo.jpg",
    author: "VaKarM.net",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Zywoo_2022_(cropped).jpg",
  },
  "hltv:19230": {
    src: "./assets/players/m0nesy.png",
    author: "G2 Esports",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:M0nesy.png",
  },
  "hltv:16693": {
    src: "./assets/players/flamez.jpg",
    author: "VaKarM.net",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:FlameZ_2024.jpg",
    position: "58% center",
  },
  "hltv:11816": {
    src: "./assets/players/ropz.jpg",
    author: "VaKarM.net",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Ropz_at_Blast_Paris_Major_2023_(cropped).jpg",
  },
  "hltv:13776": {
    src: "./assets/players/jame.jpg",
    author: "Ricco Baroni",
    license: "CC0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Jame_with_the_Parivision.jpg",
  },
  "hltv:3741": {
    src: "./assets/players/niko.png",
    author: "G2 Esports",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:NiKo_2022.png",
  },
  "hltv:7938": {
    src: "./assets/players/xantares.jpg",
    author: "BIG CLAN",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Xantares_in_2020.jpg",
  },
};

export function playerPortraitFor(playerId) {
  return PORTRAITS[String(playerId)] || null;
}
