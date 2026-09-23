import { describe, expect, it } from "vitest";

import { outcomeForWriteCode } from "./write-result";

describe("write result safety outcomes", () => {
  it("keeps execution failures distinct from user verification and unsupported controls", () => {
    expect(outcomeForWriteCode("EXECUTION_FAILED")).toBe("failed");
    expect(outcomeForWriteCode("STALE_TARGET")).toBe("needs-verification");
    expect(outcomeForWriteCode("RETAINED_VALUE_UNCONFIRMED")).toBe(
      "needs-verification",
    );
    expect(outcomeForWriteCode("UNSUPPORTED_FORMAT")).toBe("unsupported");
    expect(outcomeForWriteCode("REVIEW_UNAVAILABLE")).toBe("unsupported");
  });
});
