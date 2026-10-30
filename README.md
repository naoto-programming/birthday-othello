# 誕生日オセロ

日付を引っぱり合って、自分の誕生日にぴったり止めたら勝ちのオセロです。
1台のPCまたはスマートフォンを2人で交代に操作して遊びます。

- 遊ぶ: https://naoto-programming.github.io/birthday-othello/
- ルールと設計: `docs/superpowers/specs/2026-10-29-birthday-othello-design.md`

## 開発

```bash
npm test          # ルール・日付・祝日の単体テスト(Node.js v23 以降)
npm run serve     # http://localhost:8000/ で配信
npm run smoke     # ヘッドレス Chrome で画面を操作して確認(Google Chrome が必要)
```

Mac がスリープすると自動テストが途中で止まるため、`caffeinate -i npm run smoke` で実行してください。

イベントの追加や効果の入れ替えは `js/events.js` の `EVENTS` を編集します。
