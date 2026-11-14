import { defineAssets } from '@iwsdk/core';

// Audio is loaded by our own engine (src/audio), not the IWSDK asset manager,
// so this manifest is intentionally empty. Keep this module side-effect free:
// the editor evaluates it in a separate realm.
export default defineAssets({});
