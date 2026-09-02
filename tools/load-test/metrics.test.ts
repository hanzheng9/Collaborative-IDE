import { describe, expect, it } from "vitest";
import { average, percentile, summarizeLatencies } from "./metrics";

describe("load-test metrics", () => {
  it("calculates averages", () => {
    expect(average([])).toBe(0);
    expect(average([10, 20, 30])).toBe(20);
  });

  it("calculates nearest-rank percentiles", () => {
    const values = [50, 10, 40, 20, 30];

    expect(percentile([], 95)).toBe(0);
    expect(percentile(values, 0)).toBe(10);
    expect(percentile(values, 50)).toBe(30);
    expect(percentile(values, 95)).toBe(50);
    expect(percentile(values, 100)).toBe(50);
  });

  it("summarizes latency distributions", () => {
    expect(summarizeLatencies([10, 20, 30, 40])).toEqual({
      average: 25,
      max: 40,
      p50: 20,
      p95: 40,
      p99: 40
    });
  });
});
