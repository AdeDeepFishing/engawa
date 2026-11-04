# Fixtures

The shape of the 渋谷区防災ポータル 防災行政無線 feed as read on 2026-11-04 (`renkei_73_bosai_radio_list.js` and `renkei_73_bosai_radio_<yyyymm>.js`, served as `application/json`; the tests serve them as `text/html`, one with a byte order mark).

- `list.json`: the list, newest month first, cut to three months.
- `radio_202610.json`: the 2026/10/16 12:40 緊急地震速報 entry. Title and the Japanese and English messages as the feed has them; the Chinese, Korean and French texts and every attachment URL are written for the tests.
- `radio_202608.json`: a Jアラート test broadcast, written for the tests in the feed's shape.
- `radio_202611.json`: two broadcasts of a fictional drill on 2026/11/05, listed newest first as the portal does, with Windows line ends. The English of the 10:30 one carries a time the Japanese does not, so the post gets the 英語 line; the 10:00 one does not.
