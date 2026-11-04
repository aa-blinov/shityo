# Source layout

Shityo keeps the native layout of its two stacks. The Python service is in
[backend/app](../backend/app), and the SvelteKit application is in
[frontend/src](../frontend/src). Shared API shapes live in frontend/src/lib/types.ts.
This index is the root source entry point required by the house standard; code
stays in the stack directories so framework discovery and tools remain native.
