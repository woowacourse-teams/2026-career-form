import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    description: "채용 지원 정보를 안전하게 재사용하는 Chrome 확장 프로그램",
    name: "Career Form",
    permissions: ["storage", "sidePanel"],
    side_panel: {
      default_path: "sidepanel.html",
    },
    version: "0.1.0",
  },
  modules: ["@wxt-dev/module-react"],
});
