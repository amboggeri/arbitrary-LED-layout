import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "protocols", environment: "node" },
});
