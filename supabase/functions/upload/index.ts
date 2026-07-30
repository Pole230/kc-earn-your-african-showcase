import { serve } from "std/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_PUBLISHABLE_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!; // for validating token
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; // privileged operations

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase env vars for Edge Function: SUPABASE_URL/PUBLISHABLE_KEY/SERVICE_ROLE_KEY");
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const validator = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: { headers: {} },
  auth: { persistSession: false },
});

const MAX_UPLOAD_BYTES = Number(Deno.env.get("MAX_UPLOAD_BYTES") ?? 1000 * 1024 * 1024); // default 1GB
const RATE_LIMIT_PER_HOUR = Number(Deno.env.get("UPLOAD_RATE_LIMIT_PER_HOUR") ?? 6); // default 6 uploads per hour

const ALLOWED_EXT = ["mp4", "mov", "webm"];
const ALLOWED_MIMES = ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"];

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });

    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");

    // Validate token by asking Supabase auth for claims
    const { data: claimData, error: claimErr } = await validator.auth.getClaims(token);
    if (claimErr || !claimData?.claims || !claimData.claims.sub) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }

    const userId = claimData.claims.sub;

    const body = await req.json().catch(() => null);
    if (!body) return new Response(JSON.stringify({ error: "Missing body" }), { status: 400 });

    const { filename, contentType, size, checksum } = body as {
      filename: string;
      contentType?: string | null;
      size?: number | null;
      checksum?: string | null;
    };

    if (!filename) return new Response(JSON.stringify({ error: "Missing filename" }), { status: 400 });

    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXT.includes(ext)) {
      return new Response(JSON.stringify({ error: "Unsupported file extension" }), { status: 400 });
    }

    if (contentType && !ALLOWED_MIMES.includes(contentType)) {
      return new Response(JSON.stringify({ error: "Unsupported content type" }), { status: 400 });
    }

    if (size && size > MAX_UPLOAD_BYTES) {
      return new Response(JSON.stringify({ error: `File too large. Max ${MAX_UPLOAD_BYTES} bytes` }), { status: 413 });
    }

    // Basic rate limiting using recent uploads count in videos table
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countErr } = await admin
      .from("videos")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", cutoff);

    if (countErr) {
      console.warn("Rate limit check failed, proceeding without enforcement", countErr);
    } else if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 });
    }

    // Prevent duplicates by optional checksum or filename within last 24 hours
    if (checksum) {
      const { data: dup, error: dupErr } = await admin
        .from("videos")
        .select("id,status")
        .eq("user_id", userId)
        .eq("checksum", checksum)
        .limit(1);
      if (!dupErr && dup && dup.length > 0) {
        return new Response(JSON.stringify({ error: "Duplicate upload", existing: dup[0] }), { status: 409 });
      }
    } else {
      // check same filename in last day
      const dayCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: dup2, error: dup2Err } = await admin
        .from("videos")
        .select("id,status,video_path")
        .eq("user_id", userId)
        .like("video_path", `%${filename}%`)
        .gte("created_at", dayCutoff)
        .limit(1);
      if (!dup2Err && dup2 && dup2.length > 0) {
        return new Response(JSON.stringify({ error: "Duplicate filename recently uploaded", existing: dup2[0] }), { status: 409 });
      }
    }

    // Build storage path
    const stamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 9);
    const storagePath = `uploads/${userId}/${stamp}_${rand}.${ext}`;

    // Create video DB record (status: processing) using service role
    const insertBody: any = {
      user_id: userId,
      title: filename.replace(/\.[^/.]+$/, ""),
      description: null,
      category: null,
      duration_seconds: null,
      views_count: 0,
      status: "processing",
      video_path: storagePath,
      thumbnail_path: null,
      created_at: new Date().toISOString(),
    };
    if (checksum) insertBody.checksum = checksum;
    if (size) insertBody.expected_size = size;

    const { data: created, error: createErr } = await admin
      .from("videos")
      .insert(insertBody)
      .select()
      .single();

    if (createErr) {
      console.error("Failed to create video record", createErr);
      return new Response(JSON.stringify({ error: "Failed to create video record" }), { status: 500 });
    }

    // create a job row so worker knows to process this video (worker may wait for file to be present)
    try {
      await admin.from("video_jobs").insert({ video_id: created.id, status: "pending", attempt: 0 });
    } catch (e) {
      // non-fatal
      console.warn("Failed to insert video job (non-fatal)", e);
    }

    // generate signed upload URL using Supabase storage admin REST endpoint
    // POST /storage/v1/object/sign/{path}
    const signUrl = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/sign/${encodeURIComponent(storagePath)}?bucket=videos`;
    const signResp = await fetch(signUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expires_in: 60 * 60 }),
    });

    if (!signResp.ok) {
      const text = await signResp.text();
      console.error("Failed to sign upload url", text);
      return new Response(JSON.stringify({ error: "Failed to create signed upload url" }), { status: 500 });
    }

    const signJson = await signResp.json();
    const uploadUrl = signJson.signed_url || signJson.url;

    // Response includes signed upload URL that accepts PUT. Client must upload the file using PUT with the same content-type.
    return new Response(JSON.stringify({ videoId: created.id, uploadUrl, storagePath }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500 });
  }
});
