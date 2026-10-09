import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTime, formatTime, TimeParseError } from "../src/index.js";

test("parses 24-hour HH:MM", () => {
  assert.deepEqual(parseTime("15:00"), { hour: 15, minute: 0 });
});

test("parses 24-hour with seconds, discarding seconds", () => {
  assert.deepEqual(parseTime("15:30:45"), { hour: 15, minute: 30 });
});

test("parses compact 24-hour HHMM", () => {
  assert.deepEqual(parseTime("1500"), { hour: 15, minute: 0 });
});

test("parses bare 24-hour hour", () => {
  assert.deepEqual(parseTime("15"), { hour: 15, minute: 0 });
});

test("parses glued 12-hour form like 3pm", () => {
  assert.deepEqual(parseTime("3pm"), { hour: 15, minute: 0 });
});

test("parses spaced 12-hour form like 3:00 PM", () => {
  assert.deepEqual(parseTime("3:00 PM"), { hour: 15, minute: 0 });
});

test("parses dotted meridiem like 3:00 P.M.", () => {
  assert.deepEqual(parseTime("3:00 P.M."), { hour: 15, minute: 0 });
});

test("12am converts to midnight (hour 0)", () => {
  assert.deepEqual(parseTime("12am"), { hour: 0, minute: 0 });
});

test("12pm converts to noon (hour 12)", () => {
  assert.deepEqual(parseTime("12pm"), { hour: 12, minute: 0 });
});

test("single-letter meridiem a and p", () => {
  assert.deepEqual(parseTime("3a"), { hour: 3, minute: 0 });
  assert.deepEqual(parseTime("3p"), { hour: 15, minute: 0 });
});

test("rejects hour 0 with meridiem", () => {
  assert.throws(() => parseTime("0am"), TimeParseError);
});

test("rejects hour 13 with meridiem", () => {
  assert.throws(() => parseTime("13pm"), TimeParseError);
});

test("rejects minute out of range", () => {
  assert.throws(() => parseTime("15:60"), TimeParseError);
});

test("rejects unknown trailing token", () => {
  assert.throws(() => parseTime("3:00 ZZZ"), TimeParseError);
});

test("rejects empty input", () => {
  assert.throws(() => parseTime("   "), TimeParseError);
});

test("rejects non-string input", () => {
  assert.throws(() => parseTime(123), TimeParseError);
});

test("formatTime zero-pads", () => {
  assert.equal(formatTime({ hour: 3, minute: 5 }), "03:05");
});

test("parseTime then formatTime round-trips a 24-hour value", () => {
  assert.equal(formatTime(parseTime("3:00 PM")), "15:00");
});

test("error preserves original input", () => {
  try {
    parseTime("not a time");
    assert.fail("should have thrown");
  } catch (e) {
    assert.ok(e instanceof TimeParseError);
    assert.equal(e.input, "not a time");
  }
});
