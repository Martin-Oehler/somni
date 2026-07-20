import { describe, expect, it } from "vitest";
import { AGE_PRIOR_TABLE, priorForAgeWeeks, resolvePrior, NEUTRAL_AGE_WEEKS } from "./priors";

describe("age priors", () => {
  it("returns table rows exactly at row ages", () => {
    for (const row of AGE_PRIOR_TABLE) {
      expect(priorForAgeWeeks(row.ageWeeks).knots).toEqual(row.knots);
    }
  });

  it("interpolates linearly between rows", () => {
    const p = priorForAgeWeeks(21); // halfway between 16 and 26
    expect(p.knots[0]).toBeCloseTo((95 + 130) / 2, 5);
    expect(p.napCount).toBeCloseTo(3.5, 5);
  });

  it("clamps outside the table", () => {
    expect(priorForAgeWeeks(-5).knots).toEqual(AGE_PRIOR_TABLE[0].knots);
    expect(priorForAgeWeeks(500).knots).toEqual(AGE_PRIOR_TABLE[AGE_PRIOR_TABLE.length - 1].knots);
  });

  it("null birthdate → neutral prior, null age", () => {
    const { ageWeeks, prior } = resolvePrior(null, Date.now());
    expect(ageWeeks).toBeNull();
    expect(prior.ageWeeks).toBe(NEUTRAL_AGE_WEEKS);
  });

  it("wake windows grow monotonically with age at every knot", () => {
    for (let i = 1; i < AGE_PRIOR_TABLE.length; i++) {
      for (let k = 0; k < 6; k++) {
        expect(AGE_PRIOR_TABLE[i].knots[k]).toBeGreaterThanOrEqual(AGE_PRIOR_TABLE[i - 1].knots[k]);
      }
    }
  });
});
