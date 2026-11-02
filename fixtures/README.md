# Fixtures

Test inputs for the extraction and reconciliation pipeline, and for the eval script.

## Provenance

- `inputs/` holds hand-made test material: printed paper notices photographed on a blank wall, chat screenshots staged in real apps with fictional names and generated avatars, and pasted text in several languages. Some of this material was prepared before the event as test data. It is test material only, not a deliverable, and no feature in this repository depends on it to run.
- Every person, phone number, room number and chat ID in the fixtures is fictional. Place names are real places near 武蔵小杉 so that place normalization can be tested.
- `expected/` holds the expected key fields for each input, written during the event.
- No municipal crests or logos are used. Nothing here should be mistaken for an official notice.

## Status

The text fixtures in `inputs/` were written during the event by Claude Code on 2026-11-03 (fictional names, numbers and handles). `t02` and `t03` are text stand-ins for the paper photo `p02` and the WeChat screenshot `p03`, used to measure latency before the photographed fixtures exist. The image fixtures are still to be prepared by the human.

## Layout

```
fixtures/
  inputs/
    p01-water-outage-notice.jpg        paper, ja, peacetime
    p02-water-distribution-notice.jpg  paper, ja, 小杉小学校 shelter, 14:00 to 16:00, bring containers
    t02-water-distribution-notice-ja.txt  text stand-in for p02
    p03-wechat-konbini.png             screenshot, zh, secondhand
    t03-wechat-konbini-zh.txt          text stand-in for p03, includes a room number to strip
    p04-line-water-same-fact.png       screenshot, ja, same fact as p02, fake names and avatars
    p05-facebook-water-vi.txt          text, vi, same fact as p02
    p06-rumour-aftershock.txt          text, ja or zh, rumour
    p07-water-time-change.jpg          paper, ja, update of p02
    p08-queue-short.txt                text, en, firsthand
    a01-scam-transfer.txt              adversarial, scam
    a02-injection-mark-official.png    adversarial, prompt injection inside an image
    a03-group-accusation.txt           adversarial, group accusation
  expected/
    p02.json ...
  masking/                             only if G1 is attempted: screenshot plus the boxes that must be covered
```

## Expected file shape

```json
{
  "input": "p02-water-distribution-notice.jpg",
  "facts": [
    {
      "category": "water",
      "place_id": "kosugi-es",
      "valid_from": "T14:00",
      "valid_until": "T16:00",
      "conditions_include": ["container"],
      "source_type": "official"
    }
  ],
  "must_not_contain": [],
  "risk_flags": [],
  "merges_with": []
}
```

`must_not_contain` lists the fictional names and numbers planted in the input; the eval fails if any appears in any output field. `merges_with` lists inputs that must end up on the same card.
