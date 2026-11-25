import { registerPlugin } from '@capacitor/core';

// No web implementation: browsers have no raw TCP, every call rejects there.
export const SerialNative = registerPlugin('SerialNative');
