<img src="assets/icon.png" width="64" alt="">

# xspamblock

[![Userscript](https://img.shields.io/badge/userscript-Violentmonkey%20%7C%20Tampermonkey-blue)](#install)

A JavaScript userscript for x.com that hides posts, replies and profiles of accounts from community blocklists ([Blocked for AI Reply](https://blockedforaireply.levels.io/), [Clankwall](https://clankwall.vogel.dev/)). 

Your account blocklist remains unchanged.

## Install

1. Install a userscript manager (a browser extension that runs userscripts): [Violentmonkey](https://violentmonkey.github.io/get-it/) or [Tampermonkey](https://www.tampermonkey.net/).
2. Click [![Install userscript](https://img.shields.io/badge/install-userscript-2ea44f)](https://raw.githubusercontent.com/kingbluetooth/xspamblock/main/xspamblock.user.js) and confirm.

Or install from [Greasy Fork](https://greasyfork.org/en/scripts/606498-xspamblock).

## How it works

1. Each time X loads, the script detects changes and updates a local list cache.
2. It hides posts, replies, profiles and suggestions from any listed handle.
3. The `···` menu on a post or profile gets a "Flag" item, which hides that account on your device only. Un-hiding and adding lists are in the userscript manager menu.

## Sources

- https://blockedforaireply.levels.io/api/usernames.txt
- https://clankwall.vogel.dev/api/usernames.txt

## Limitations

- Matches handles, so renamed accounts are missed until a list updates.
- Breaks if X changes its page markup.
- Browsers only, not the native X apps.

## Disclaimer

Unofficial, and not affiliated with or endorsed by X. Use at your own risk. The script only changes how X's pages look in your browser and does not act on your account, but the author cannot guarantee that X will not object to userscripts. The author is not responsible for any account restriction, suspension or other consequence of using it.

The lists come from third parties and are their judgment, not proof. The author does not maintain them and is not responsible for who appears on them or for anything hidden as a result.

## License

MIT. See [LICENSE](LICENSE).
