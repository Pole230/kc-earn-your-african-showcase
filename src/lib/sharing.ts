export async function shareVideo(title: string, videoUrl: string, text?: string): Promise<boolean> {
  // Use native Share API if available (mobile browsers)
  if (navigator.share) {
    try {
      await navigator.share({
        title: title,
        text: text || `Check out this video: ${title}`,
        url: videoUrl,
      });
      return true;
    } catch (err) {
      // User cancelled share or error occurred
      if ((err as any).name !== "AbortError") {
        console.error("Share failed", err);
      }
      return false;
    }
  }

  // Fallback: copy link to clipboard
  try {
    await navigator.clipboard.writeText(videoUrl);
    return true;
  } catch (err) {
    console.error("Failed to copy to clipboard", err);
    return false;
  }
}

export function getShareText(title: string, creatorName: string): string {
  return `Watch "${title}" by ${creatorName} on KC Earn`;
}

export function generateShareUrl(baseUrl: string, videoId: string): string {
  return `${baseUrl}/video/${videoId}`;
}
