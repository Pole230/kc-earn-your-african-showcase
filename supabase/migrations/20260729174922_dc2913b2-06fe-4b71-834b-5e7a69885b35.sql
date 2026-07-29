CREATE POLICY "Video media is readable" ON storage.objects FOR SELECT USING (bucket_id IN ('videos','thumbnails'));

CREATE POLICY "Creators upload own media" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('videos','thumbnails') AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Creators update own media" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id IN ('videos','thumbnails') AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Creators delete own media" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id IN ('videos','thumbnails') AND (storage.foldername(name))[1] = auth.uid()::text);