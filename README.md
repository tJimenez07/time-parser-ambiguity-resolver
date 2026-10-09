# Time Parser Ambiguity Resolver

A small, zero-dependency parser that turns loosely formatted time strings like `3pm`, `15:00`, and `3:00 PM` into a normalized 24-hour structure `{ hour, minute }`, rejecting anything ambiguous or out of range.

## Usage

```js
import { parseTime, formatTime, TimeParseError } from "./src/index.js";

const t = parseTime("3:00 PM");  // { hour: 15, minute: 0 }
console.log(formatTime(t));     // "15:00"

try {
  parseTime("13pm");
} catch (e) {
  if (e instanceof TimeParseError) {
    console.log(`Could not parse: ${e.input}`);
  }
}
```

## Why this exists

Times in free text arrive in many shapes — glued meridiems (`3pm`), dotted ones (`3:00 P.M.`), 24-hour compact form (`1500`), or bare hours (`15`). Most of these can be normalized, but a few are genuinely ambiguous. Rather than guessing, this library fixes one interpretation per ambiguous form, documents it, and throws `TimeParseError` for anything it cannot classify confidently. A rejected input is safer than a silently misclassified one.

## Accepted forms

- 24-hour: `15:00`, `15:00:00` (seconds discarded), `1500`, `15`
- 12-hour with meridiem: `3pm`, `3 pm`, `3:00 PM`, `3:00PM`, `3:00 P.M.`, `03:00 am`
- Single-letter meridiems: `3a`, `3p`

## The awkward edges

- `12am` parses as hour `0` (midnight); `12pm` parses as hour `12` (noon). This matches the most common 12-hour-clock wrap convention. If your application expects the opposite, this library is not for you.
- A bare hour like `15` is treated as 24-hour. `15pm` is rejected as contradictory, not silently converted.
- Seconds, if present, are accepted but dropped — the returned structure only carries `hour` and `minute`.
- Meridiems are case-insensitive and tolerate internal dots and trailing periods, but must stand alone as a token (possibly glued to digits as in `3pm`); compound suffixes are not supported.
