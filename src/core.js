/**
 * Time parsing core.
 *
 * The parser is deliberately restrictive about what it accepts. Ambiguity in
 * time strings is a real-world hazard (does "12am" mean midnight or noon?),
 * so instead of guessing we pick one interpretation per form, document it,
 * and reject anything that does not fit a known form. A rejected input is
 * always preferable to a silently wrong parse, because the caller can act on
 * a thrown error but cannot easily detect a misclassified time.
 */

/**
 * Normalized 24-hour time. `hour` is 0-23, `minute` is 0-59.
 * For inputs that omit minutes, minute is 0 by convention.
 *
 * @typedef {Object} NormalizedTime
 * @property {number} hour   0-23
 * @property {number} minute 0-59
 */

/**
 * Thrown when an input cannot be matched to a supported form, or when a
 * field is numerically out of range. Callers should treat this as a soft
 * validation failure, not a programmer error.
 */
export class TimeParseError extends Error {
  /**
   * @param {string} message Human-readable reason.
   * @param {string} input   The original input string, preserved for display.
   */
  constructor(message, input) {
    super(message);
    this.name = "TimeParseError";
    this.input = input;
  }
}

// Meridiem lookup. Case-insensitive, dot-insensitive, whitespace-tolerant.
// Keys are the normalized forms we compare against.
const MERIDIEMS = new Map([
  ["am", "am"],
  ["pm", "pm"],
  ["a.m.", "am"],
  ["p.m.", "pm"],
  ["a.m", "am"],
  ["p.m", "pm"],
]);

/**
 * Convert a meridiem token to its canonical "am"/"pm" form, or null if the
 * token is not a recognized meridiem. We pre-strip trailing periods so that
 * "am", "a.m.", and "a.m" all reduce to the same key.
 *
 * @param {string} rawToken
 * @returns {string|null}
 */
function normalizeMeridiem(rawToken) {
  const lower = rawToken.toLowerCase();
  // Collapse internal dots so "a.m." -> "am." -> then we rely on the map which
  // already lists both dotted and undotted variants. Simpler: check the map
  // directly since it enumerates the accepted forms.
  if (MERIDIEMS.has(lower)) {
    return MERIDIEMS.get(lower);
  }
  // Also accept "a" and "p" as one-letter meridiems; common in terse notes.
  if (lower === "a") return "am";
  if (lower === "p") return "pm";
  return null;
}

/**
 * Parse a loosely-formatted time string into a normalized 24-hour structure.
 *
 * Accepted forms (all case-insensitive, whitespace-tolerant):
 *   - 24-hour: "15:00", "15:00:00", "1500", "15"
 *   - 12-hour with explicit meridiem: "3pm", "3 pm", "3:00 PM", "3:00PM",
 *     "3:00 P.M.", "03:00 am"
 *
 * Conventions chosen for awkward cases (these are the single supported
 * interpretation each):
 *   - "12am" -> hour 0 (midnight). This is the most common convention and
 *     matches the 12-hour clock's wrap point.
 *   - "12pm" -> hour 12 (noon). The mirror of the above; "12" at midday
 *     stays at 12 in 24-hour terms.
 *   - Seconds, if present, are accepted but ignored. They rarely matter for
 *     scheduling and rejecting them would needlessly break otherwise-valid
 *     inputs. The returned structure does not carry seconds.
 *   - A bare hour in 24-hour form (e.g. "15") is accepted only if there is
 *     no meridiem. "15pm" is rejected as contradictory.
 *
 * @param {string} input
 * @returns {NormalizedTime}
 * @throws {TimeParseError} If the input is not a recognized, in-range time.
 */
export function parseTime(input) {
  if (typeof input !== "string") {
    throw new TimeParseError("Input must be a string", String(input));
  }

  const raw = input.trim();
  if (raw === "") {
    throw new TimeParseError("Input is empty", input);
  }

  // Split on the first whitespace boundary. Everything before is the "time
  // part" (hour, optional colon-minute, optional colon-second). Everything
  // after is treated as a possible meridiem. This lets us handle "3 pm",
  // "3:00 PM", and "15:00" uniformly.
  const spaceIdx = raw.search(/\s/);
  let timePart;
  let meridiem = null;
  if (spaceIdx === -1) {
    // Could be "3pm" — meridiem glued to digits. Try to peel trailing
    // non-digit, non-colon characters off the end.
    const match = raw.match(/^([0-9:]+)([A-Za-z.]+)$/);
    if (match) {
      timePart = match[1];
      const m = normalizeMeridiem(match[2]);
      if (m === null) {
        throw new TimeParseError(`Unknown meridiem "${match[2]}"`, input);
      }
      meridiem = m;
    } else {
      timePart = raw;
    }
  } else {
    timePart = raw.slice(0, spaceIdx);
    const tail = raw.slice(spaceIdx).trim();
    if (tail !== "") {
      const m = normalizeMeridiem(tail);
      if (m === null) {
        throw new TimeParseError(`Unknown trailing token "${tail}"`, input);
      }
      meridiem = m;
    }
  }

  // Now parse the timePart, which should consist of digits and at most two
  // colons.
  let hourStr, minuteStr;
  if (timePart.includes(":")) {
    const parts = timePart.split(":");
    if (parts.length < 2 || parts.length > 3) {
      throw new TimeParseError("Time must have 1 or 2 colons, not more", input);
    }
    hourStr = parts[0];
    minuteStr = parts[1];
    // parts[2] (seconds) is intentionally discarded; see JSDoc.
  } else {
    // No colons. Could be "3" or "1500". A bare hour (1-2 digits) is allowed
    // only if no minute was given. A 3-4 digit block is interpreted as HHMM.
    if (!/^[0-9]+$/.test(timePart)) {
      throw new TimeParseError("Time part contains non-digits", input);
    }
    if (timePart.length <= 2) {
      hourStr = timePart;
      minuteStr = "0";
    } else if (timePart.length === 3 || timePart.length === 4) {
      hourStr = timePart.slice(0, timePart.length - 2);
      minuteStr = timePart.slice(-2);
    } else {
      throw new TimeParseError("Time digits too long to interpret", input);
    }
  }

  if (!/^[0-9]+$/.test(hourStr) || !/^[0-9]+$/.test(minuteStr)) {
    throw new TimeParseError("Hour and minute must be numeric", input);
  }

  const hourNum = parseInt(hourStr, 10);
  const minuteNum = parseInt(minuteStr, 10);

  if (meridiem !== null) {
    // 12-hour form. Hour must be 1-12 before meridiem adjustment.
    if (hourNum < 1 || hourNum > 12) {
      throw new TimeParseError(
        `Hour must be 1-12 with a meridiem, got ${hourNum}`,
        input,
      );
    }
    let h = hourNum;
    if (meridiem === "am") {
      h = hourNum === 12 ? 0 : hourNum;
    } else {
      h = hourNum === 12 ? 12 : hourNum + 12;
    }
    if (minuteNum < 0 || minuteNum > 59) {
      throw new TimeParseError(`Minute out of range: ${minuteNum}`, input);
    }
    return { hour: h, minute: minuteNum };
  }

  // 24-hour form. Hour 0-23, minute 0-59.
  if (hourNum < 0 || hourNum > 23) {
    throw new TimeParseError(`Hour out of range (0-23): ${hourNum}`, input);
  }
  if (minuteNum < 0 || minuteNum > 59) {
    throw new TimeParseError(`Minute out of range (0-59): ${minuteNum}`, input);
  }
  return { hour: hourNum, minute: minuteNum };
}

/**
 * Format a normalized time as a zero-padded 24-hour string like "15:00".
 *
 * Kept here rather than in a separate module because formatting is the
 * mirror of parsing and the two are easiest to keep in sync when they live
 * together.
 *
 * @param {NormalizedTime} t
 * @returns {string}
 */
export function formatTime(t) {
  if (!t || typeof t.hour !== "number" || typeof t.minute !== "number") {
    throw new TimeParseError("Invalid time object", String(t));
  }
  if (t.hour < 0 || t.hour > 23 || t.minute < 0 || t.minute > 59) {
    throw new TimeParseError("Time fields out of range", String(t));
  }
  const hh = String(t.hour).padStart(2, "0");
  const mm = String(t.minute).padStart(2, "0");
  return `${hh}:${mm}`;
}
