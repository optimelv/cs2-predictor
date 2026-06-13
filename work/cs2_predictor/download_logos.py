from __future__ import annotations

import re
import urllib.request
import urllib.error
import time
from pathlib import Path

# Match the urls from export_site_predictions.py
TEAM_LOGO_URLS = {
    "9z": "https://liquipedia.net/commons/images/thumb/9/9b/9z_Team_2024_darkmode.png/600px-9z_Team_2024_darkmode.png",
    "Astralis": "https://liquipedia.net/commons/images/thumb/3/3d/Astralis_2020_allmode.png/41px-Astralis_2020_allmode.png",
    "Aurora": "https://img-cdn.hltv.org/teamlogo/yJzPNOeXlyiniNxanYJCrv.png?ixlib=java-2.1.0&w=100&s=f23524510b9d49ea59166e6e2efee1ac",
    "B8": "https://liquipedia.net/commons/images/thumb/a/a6/B8_darkmode.png/600px-B8_darkmode.png",
    "BIG": "https://liquipedia.net/commons/images/thumb/6/69/BIG_2020_darkmode.png/35px-BIG_2020_darkmode.png",
    "BetBoom": "https://liquipedia.net/commons/images/thumb/5/5b/BetBoom_Team_2024_allmode.png/56px-BetBoom_Team_2024_allmode.png",
    "FURIA": "https://liquipedia.net/commons/images/thumb/a/aa/FURIA_Esports_allmode.png/51px-FURIA_Esports_allmode.png",
    "FUT": "https://liquipedia.net/commons/images/thumb/0/08/Futbolist_2021_darkmode.png/600px-Futbolist_2021_darkmode.png",
    "Falcons": "https://liquipedia.net/commons/images/thumb/8/83/Team_Falcons_2022_allmode.png/41px-Team_Falcons_2022_allmode.png",
    "FlyQuest": "https://liquipedia.net/commons/images/thumb/b/b2/FlyQuest_2021_allmode.png/51px-FlyQuest_2021_allmode.png",
    "G2": "https://liquipedia.net/commons/images/thumb/4/4b/G2_Esports_2020_lightmode.png/43px-G2_Esports_2020_lightmode.png",
    "GamerLegion": "https://liquipedia.net/commons/images/thumb/2/21/GamerLegion_2026_allmode.png/600px-GamerLegion_2026_allmode.png",
    "Legacy": "https://liquipedia.net/commons/images/thumb/3/34/Legacy_allmode.png/49px-Legacy_allmode.png",
    "M80": "https://liquipedia.net/commons/images/thumb/5/55/M80_2023_allmode.png/600px-M80_2023_allmode.png",
    "MIBR": "https://liquipedia.net/commons/images/thumb/7/72/MIBR_2018_darkmode.png/600px-MIBR_2018_darkmode.png",
    "MOUZ": "https://liquipedia.net/commons/images/thumb/c/c2/MOUZ_2021_allmode.png/47px-MOUZ_2021_allmode.png",
    "Monte": "https://liquipedia.net/commons/images/thumb/2/22/Monte_2022_allmode.png/600px-Monte_2022_allmode.png",
    "NAVI": "https://liquipedia.net/commons/images/thumb/9/95/Natus_Vincere_2021_allmode.png/57px-Natus_Vincere_2021_allmode.png",
    "Natus Vincere": "https://liquipedia.net/commons/images/thumb/9/95/Natus_Vincere_2021_allmode.png/57px-Natus_Vincere_2021_allmode.png",
    "PARIVISION": "https://liquipedia.net/commons/images/thumb/9/9d/PARIVISION_allmode.png/600px-PARIVISION_allmode.png",
    "Spirit": "https://liquipedia.net/commons/images/thumb/8/80/Team_Spirit_2022_darkmode.png/43px-Team_Spirit_2022_darkmode.png",
    "TYLOO": "https://liquipedia.net/commons/images/thumb/5/5f/TyLoo_2016_allmode.png/600px-TyLoo_2016_allmode.png",
    "The MongolZ": "https://liquipedia.net/commons/images/thumb/2/2b/The_MongolZ_2024_03_allmode.png/600px-The_MongolZ_2024_03_allmode.png",
    "Vitality": "https://liquipedia.net/commons/images/thumb/9/96/Team_Vitality_2023_darkmode.png/41px-Team_Vitality_2023_darkmode.png",
    "paiN": "https://liquipedia.net/commons/images/d/d3/PaiN_Gaming_2023_darkmode.png",
}

def normalize_team_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", name.casefold()).strip()

def main():
    # Setup paths relative to this script
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent.parent
    logos_dir = repo_root / "docs" / "assets" / "logos"

    print(f"Creating directory: {logos_dir}")
    logos_dir.mkdir(parents=True, exist_ok=True)

    user_agent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    success_count = 0
    fail_count = 0

    for team_name, url in TEAM_LOGO_URLS.items():
        normalized = normalize_team_name(team_name).replace(" ", "_")
        dest_filename = f"{normalized}.png"
        dest_path = logos_dir / dest_filename

        print(f"Downloading logo for '{team_name}' -> {dest_filename}...")

        referer = "https://www.hltv.org/" if "hltv.org" in url else "https://liquipedia.net/"
        req = urllib.request.Request(url, headers={"User-Agent": user_agent, "Referer": referer})
        try:
            with urllib.request.urlopen(req) as response:
                image_data = response.read()
                dest_path.write_bytes(image_data)
            print(f"  Successfully downloaded: {dest_filename}")
            success_count += 1
        except urllib.error.HTTPError as e:
            print(f"  HTTP Error downloading '{team_name}': {e.code} - {e.reason}")
            fail_count += 1
        except Exception as e:
            print(f"  Error downloading '{team_name}': {e}")
            fail_count += 1

        # Be polite to Liquipedia's CDN
        time.sleep(0.5)

    print("\nDownload finished.")
    print(f"Successfully downloaded: {success_count}/{len(TEAM_LOGO_URLS)}")
    if fail_count > 0:
        print(f"Failed downloads: {fail_count}")

if __name__ == "__main__":
    main()
