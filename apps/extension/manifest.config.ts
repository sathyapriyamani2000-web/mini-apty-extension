import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,

  name: "Mini Apty",

  version: "1.0.0",

  permissions: [
  "storage",
  "activeTab",
  "scripting",
  "tabs"
],

  host_permissions: [
    "<all_urls>"
  ],

  background: {
    service_worker: "src/background.ts"
  },

  action: {
    default_popup: "index.html"
  },

  content_scripts: [
  {
    matches: ["<all_urls>"],
    js: ["src/content.js"]
  }
],

  content_security_policy: {
  extension_pages:
    "script-src 'self'; object-src 'self'; connect-src http://localhost:3000"
},
});