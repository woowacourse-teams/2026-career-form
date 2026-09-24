import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Sequential field presentation yields between writes; integration assertions
// must allow the whole form to finish, including instrumented coverage runs.
configure({ asyncUtilTimeout: 3000 });

afterEach(() => cleanup());
