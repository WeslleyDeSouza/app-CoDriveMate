import { Capacitor } from '@capacitor/core';

/** Saves a file: as a download, or in the apps, which know none, through the share sheet. */
export async function saveFile(name: string, blob: Blob): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const files = [new File([blob], name, { type: blob.type })];
    if (navigator.canShare?.({ files })) {
      await navigator.share({ files }).catch((error: unknown) => {
        // Closing the sheet is a decision, not a failure.
        if ((error as Error)?.name !== 'AbortError') throw error;
      });
      return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
