// Type definitions for video records used across the frontend
// File: src/types/video.ts

import type { Category } from '@/data/content';

export type Video = {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  category?: Category | null;
  duration_seconds?: number | null;
  views_count: number;
  likes_count: number;
  status: 'processing' | 'published' | 'removed';
  video_path: string; // storage object path in the videos bucket
  thumbnail_path?: string | null; // storage object path in the thumbnails bucket
  created_at: string;
  updated_at: string;
};
