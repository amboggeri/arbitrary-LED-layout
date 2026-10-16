import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "link", environment: "node" },
});
