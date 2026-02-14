# AFL League Discord Bot

بوت دوري ديسكورد مبدئي بالأوامر التالية:

- `.sign`
- `.offer @player @teamRole`
- `.release @player`
- `.add team @role TeamName 😀 @leader1 @leader2`
- `.edit team @role NewName 😀 @leader1 @leader2`
- `.trade @player @fromRole @toRole`
- `.trade accept <trade-id>`
- `.enable transfer market`
- `.disable transfer market`
- `.max players <number>`
- `.show teams`
- `.show teams members`
- `.add stats @player goals|assists|cleansheets|games <value>`
- `.edit stats @player goals|assists|cleansheets|games <value>`
- `.remove player stats @player`

## Setup

1. ثبّت الحزم:
   ```bash
   npm install
   ```
2. انسخ ملف البيئة:
   ```bash
   cp .env.example .env
   ```
3. ضع توكن البوت في `.env` داخل `DISCORD_TOKEN`.
4. شغّل البوت:
   ```bash
   npm start
   ```

## ملاحظات

- تم استخدام `client.once('clientReady', ...)` لتجنب تحذير discord.js v14.
- البيانات تُخزّن محلياً في `data/league.json`.
- يُفضّل عدم وضع التوكن داخل الكود مباشرة.
