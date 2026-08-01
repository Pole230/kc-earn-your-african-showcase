export type VideoJob = {
  videoId: string;
  userId: string;
  videoPath: string; // storage path like videos/{user_id}/file.mp4
  thumbnailPath?: string;
  attempts?: number;
};

export type VideoRecord = {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  category?: string;
  duration_seconds?: number;
  views_count?: number;
  status: 'processing' | 'published' | 'failed' | 'removed';
  video_path: string;
  thumbnail_path?: string;
  created_at?: string;
  updated_at?: string;
};
