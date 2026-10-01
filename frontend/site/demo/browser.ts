// Website builds cannot use extension storage, messaging, tabs, or permissions.
// All native UI dependencies must be supplied explicitly by the demo.
export const browser = new Proxy(
  {},
  {
    get(_target, property) {
      throw new Error(
        `Extension API is unavailable in the website: ${String(property)}`,
      );
    },
  },
);
