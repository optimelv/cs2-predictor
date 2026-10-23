import assert from "node:assert/strict";
import { playerPortraitFor } from "../docs/lib/player-portraits.js";

const known = playerPortraitFor({ player_id: "hltv:21167" });
assert.equal(new URL(known.src).hostname, "img-cdn.hltv.org");
assert.equal(known.fallbackSrc, undefined);
const refreshed = playerPortraitFor({ player_id: "hltv:21167", portrait_url: "https://img-cdn.hltv.org/playerbodyshot/new.png?s=token", source_url: "https://www.hltv.org/player/21167/donk" });
assert.equal(refreshed.src, "https://img-cdn.hltv.org/playerbodyshot/new.png?s=token");
assert.equal(refreshed.sourceUrl, "https://www.hltv.org/player/21167/donk");
const live = playerPortraitFor({ player_id: "hltv:999", portrait_url: "https://img-cdn.hltv.org/playerbodyshot/current.png?s=token", source_url: "https://www.hltv.org/player/999/current" });
assert.equal(live.creditLabel, "HLTV profile image");
assert.equal(live.sourceUrl, "https://www.hltv.org/player/999/current");
const canonicalCredit = playerPortraitFor({ player_id: "hltv:777", portrait_url: "https://img-cdn.hltv.org/playerbodyshot/current.png?s=token", source_url: "https://example.test/player/777/wrong" });
assert.equal(canonicalCredit.sourceUrl, "https://www.hltv.org/player/777");
assert.equal(playerPortraitFor({ player_id: "hltv:998", portrait_url: "https://example.test/playerbodyshot/current.png" }), null);
console.log("player portraits ok");
