import { describe, it, expect } from "vitest";
import { getIssueSeverity } from "./issues";

describe("getIssueSeverity", () => {
  it("classifies top-off reservoir issues as critical", () => {
    expect(getIssueSeverity("top-off reservoir running dry")).toBe("critical");
  });

  it("classifies water clarity issues as critical", () => {
    expect(getIssueSeverity("water clarity dipped before evening event")).toBe("critical");
  });

  it("classifies filter sock as moderate", () => {
    expect(getIssueSeverity("filter sock clogged")).toBe("moderate");
  });

  it("classifies sump evaporation as moderate", () => {
    expect(getIssueSeverity("sump evaporation swings")).toBe("moderate");
  });

  it("classifies feeding schedule drift as routine", () => {
    expect(getIssueSeverity("feeding schedule drifted between staff")).toBe("routine");
  });

  it("classifies unknown issues as routine by default", () => {
    expect(getIssueSeverity("something totally unexpected happened")).toBe("routine");
  });

  it("is case-insensitive", () => {
    expect(getIssueSeverity("FILTER SOCK CLOGGED")).toBe("moderate");
    expect(getIssueSeverity("TOP-OFF RESERVOIR RUNNING DRY")).toBe("critical");
  });

  it("trims leading and trailing whitespace", () => {
    expect(getIssueSeverity("  filter sock clogged  ")).toBe("moderate");
  });
});
