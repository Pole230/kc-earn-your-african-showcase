/**
 * Reads duration and grabs a poster frame from a selected video file,
 * entirely in the browser, so uploads carry a real cover image.
 */
export type VideoProbe = {
  durationSeconds: number;
  thumbnailBlob: Blob | null;
  thumbnailPreview: string | null;
};

export function probeVideoFile(file: File): Promise<VideoProbe> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    const fail = (durationSeconds = 0) => {
      URL.revokeObjectURL(url);
      resolve({ durationSeconds, thumbnailBlob: null, thumbnailPreview: null });
    };

    video.onerror = () => fail();

    video.onloadedmetadata = () => {
      const durationSeconds = Number.isFinite(video.duration) ? Math.round(video.duration) : 0;
      const seekTo = Math.min(1, Math.max(0, durationSeconds / 2));
      video.currentTime = seekTo;

      video.onseeked = () => {
        try {
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, 720 / (video.videoWidth || 720));
          canvas.width = Math.round((video.videoWidth || 720) * scale);
          canvas.height = Math.round((video.videoHeight || 1280) * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) return fail(durationSeconds);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(url);
              resolve({
                durationSeconds,
                thumbnailBlob: blob,
                thumbnailPreview: blob ? URL.createObjectURL(blob) : null,
              });
            },
            "image/jpeg",
            0.82,
          );
        } catch {
          fail(durationSeconds);
        }
      };
    };
  });
}
