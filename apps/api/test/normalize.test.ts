import { describe, it, expect } from "vitest";
import { normalize, rawWeighted, MIN_SAMPLE, type RawScore } from "../src/lib/normalize.js";

const mk = (
  judgeUserId: string,
  projectId: string,
  f: number,
  q: number,
  i: number,
): RawScore => ({ judgeUserId, projectId, functionality: f, quality: q, innovation: i });

describe("rawWeighted", () => {
  it("maps an all-5s score to 100", () => {
    expect(rawWeighted(mk("j", "p", 5, 5, 5))).toBe(100);
  });

  it("maps an all-0s score to 0", () => {
    expect(rawWeighted(mk("j", "p", 0, 0, 0))).toBe(0);
  });

  it("maps 2/2/2 to 40", () => {
    expect(rawWeighted(mk("j", "p", 2, 2, 2))).toBe(40);
  });
});

describe("normalize - empty input", () => {
  it("returns empty scores and diagnostics", () => {
    const r = normalize([]);
    expect(r.scores).toEqual([]);
    expect(r.diagnostics).toEqual([]);
  });
});

describe("normalize - insufficient sample", () => {
  it("flags a single-score judge as raw", () => {
    const r = normalize([mk("jdg_01", "prj_07", 2, 2, 2)]);
    expect(r.scores).toHaveLength(1);
    expect(r.scores[0]!.method).toBe("raw");
    expect(r.scores[0]!.z).toBeNull();
    expect(r.diagnostics[0]!.method).toBe("raw");
    expect(r.diagnostics[0]!.reason).toMatch(/MIN_SAMPLE/);
    expect(r.diagnostics[0]!.count).toBe(1);
  });

  it("flags a three-score constant judge as raw, not midrank", () => {
    const rows = [
      mk("jdg_07", "prj_09", 4, 4, 4),
      mk("jdg_07", "prj_17", 4, 4, 4),
      mk("jdg_07", "prj_19", 4, 4, 4),
    ];
    const r = normalize(rows);
    expect(r.scores).toHaveLength(3);
    for (const s of r.scores) {
      expect(s.method).toBe("raw");
      expect(s.z).toBeNull();
    }
    expect(r.diagnostics[0]!.method).toBe("raw");
    expect(r.diagnostics[0]!.reason).toMatch(/MIN_SAMPLE/);
  });
});

describe("normalize - midrank fallback", () => {
  it("applies midrank when a judge has enough samples and zero variance", () => {
    const rows: RawScore[] = [];
    for (let i = 0; i < MIN_SAMPLE; i++) {
      rows.push(mk("jdg_const", "prj_" + i, 3, 3, 3));
    }
    const r = normalize(rows);
    expect(r.scores).toHaveLength(MIN_SAMPLE);
    for (const s of r.scores) {
      expect(s.method).toBe("midrank");
      expect(s.z).not.toBeNull();
    }
    expect(r.diagnostics[0]!.method).toBe("midrank");
    expect(r.diagnostics[0]!.mad).toBe(0);
    expect(r.diagnostics[0]!.reason).toMatch(/MAD == 0/);
  });

  it("midranks all-equal scores to neutral z (0)", () => {
    const rows: RawScore[] = [];
    for (let i = 0; i < MIN_SAMPLE; i++) {
      rows.push(mk("jdg_const", "prj_" + i, 5, 5, 5));
    }
    const r = normalize(rows);
    for (const s of r.scores) {
      expect(s.z).toBe(0);
    }
  });
});

describe("normalize - robust_z", () => {
  it("applies robust_z to a judge with variance and enough samples", () => {
    const rows = [
      mk("jdg_var", "prj_1", 1, 1, 1),
      mk("jdg_var", "prj_2", 2, 2, 2),
      mk("jdg_var", "prj_3", 3, 3, 3),
      mk("jdg_var", "prj_4", 4, 4, 4),
      mk("jdg_var", "prj_5", 5, 5, 5),
      mk("jdg_var", "prj_6", 3, 3, 3),
    ];
    const r = normalize(rows);
    expect(r.diagnostics[0]!.method).toBe("robust_z");
    expect(r.diagnostics[0]!.count).toBe(6);

    const byProject: Record<string, { z: number | null }> = {};
    for (const s of r.scores) byProject[s.projectId] = s;

    expect(byProject.prj_3!.z).toBeCloseTo(0, 6);
    expect(byProject.prj_5!.z).toBeCloseTo(1.349, 3);
    expect(byProject.prj_1!.z).toBeCloseTo(-1.349, 3);
  });

  it("produces deterministic output for identical input", () => {
    const rows = [
      mk("b", "p2", 1, 2, 3),
      mk("b", "p1", 4, 4, 4),
      mk("a", "p1", 2, 3, 4),
      mk("a", "p2", 5, 5, 5),
      mk("a", "p3", 3, 3, 3),
      mk("a", "p4", 2, 2, 2),
      mk("a", "p5", 1, 1, 1),
    ];
    const r1 = normalize(rows);
    const r2 = normalize([...rows].reverse());
    expect(r1.scores).toEqual(r2.scores);
    expect(r1.diagnostics).toEqual(r2.diagnostics);
  });
});

describe("normalize - rescale bounds", () => {
  it("outputs normalized values in [0, 100]", () => {
    const rows = [
      mk("j", "p1", 1, 1, 1),
      mk("j", "p2", 2, 2, 2),
      mk("j", "p3", 3, 3, 3),
      mk("j", "p4", 4, 4, 4),
      mk("j", "p5", 5, 5, 5),
      mk("j", "p6", 3, 3, 3),
    ];
    const r = normalize(rows);
    for (const s of r.scores) {
      expect(s.normalized).toBeGreaterThanOrEqual(0);
      expect(s.normalized).toBeLessThanOrEqual(100);
    }
  });
});
