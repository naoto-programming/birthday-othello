# 誕生日オセロ

日付を引っぱり合って、自分の誕生日にぴったり止めたら勝ちのオセロです。盤面が埋まったらサドンデス。
1台のPCまたはスマートフォンを2人で交代に操作して遊びます。

- 遊ぶ: https://naoto-programming.github.io/birthday-othello/
- ルールと設計: `docs/superpowers/specs/2026-11-11-birthday-othello-v3-design.md`(土台: v2 `docs/superpowers/specs/2026-11-07-birthday-othello-v2-design.md`、v1 `docs/superpowers/specs/2026-10-29-birthday-othello-design.md`。新しい版で書いていない点は前の版のまま)

## 開発

```bash
npm test          # ルール・日付・祝日の単体テスト(Node.js v23 以降)
npm run serve     # http://localhost:8000/ で配信
npm run smoke     # ヘッドレス Chrome で画面を操作して確認(Google Chrome が必要)
npm run balance   # 本物のルールでAI同士を対戦させ、バランスを確かめる
```

Mac がスリープすると長い処理が途中で止まるため、`caffeinate -i npm run smoke`・`caffeinate -i npm run balance` のように実行してください。

イベントの追加や効果の入れ替えは `js/events.js` の `EVENTS` を編集します。
