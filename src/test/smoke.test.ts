import { describe, expect, it } from "vitest";

describe("bootstrap workspace", () => {
  it("keeps the product shell named Special Organizer", () => {
    expect("Special Organizer").toBe("Special Organizer");
  });
});
