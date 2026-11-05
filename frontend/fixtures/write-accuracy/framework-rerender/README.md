# framework-rerender

Synthetic, company-neutral structure for Issue #324 stage B. The fixture carries
a tiny inline state model that re-renders a text input, a native select and a
radio group from its own state. The text editor accepts only an `InputEvent`
with an `inputType`, the select listens to `change`, and the radio group follows
React's click-derived change, so a write that does not notify the framework is
reverted on the next microtask render. Values are synthetic and expected states
come from the page structure and synthetic profile, never from observed writes.
