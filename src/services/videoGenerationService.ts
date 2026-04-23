const HEYGEN_BASE = 'https://api.heygen.com';

function heygenHeaders(apiKey: string) {
  return { 'Content-Type': 'application/json', 'X-Api-Key': apiKey };
}

export interface VideoGenOptions {
  avatarId: string;
  voiceId: string;
  backgroundAssetId?: string;
  avatarStyle?: string;       // 'circle' | 'closeup' | 'full-body'
  avatarScale?: number;       // 0.1 – 1.0, default 0.5
  avatarOffsetX?: number;     // default -0.35
  avatarOffsetY?: number;     // default 0.35
  voiceEmotion?: string;      // 'Excited' | 'Friendly' | 'Serious' | 'Soothing' | 'Broadcaster'
  voiceSpeed?: number;        // default 1
}

// POST /v2/video/generate → returns video_id immediately
export async function generateVideo(
  script: string,
  apiKey: string,
  options: VideoGenOptions,
): Promise<string> {
  const character: Record<string, unknown> = {
    type: 'avatar',
    avatar_id: options.avatarId,
    avatar_style: options.avatarStyle ?? 'circle',
    scale: options.avatarScale ?? 0.5,
    offset: {
      x: options.avatarOffsetX ?? -0.35,
      y: options.avatarOffsetY ?? 0.35,
    },
    talking_style: 'stable',
  };

  const voice: Record<string, unknown> = {
    type: 'text',
    voice_id: options.voiceId,
    input_text: script,
    speed: options.voiceSpeed ?? 1,
    pitch: 0,
    duration: '0.5',
    emotion: options.voiceEmotion ?? 'Excited',
  };

  const videoInput: Record<string, unknown> = { character, voice };

  if (options.backgroundAssetId) {
    videoInput.background = {
      type: 'video',
      play_style: 'freeze',
      video_asset_id: options.backgroundAssetId,
    };
  }

  const body = {
    caption: false,
    dimension: { width: 1920, height: 1080 },
    video_inputs: [videoInput],
  };

  const res = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
    method: 'POST',
    headers: heygenHeaders(apiKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message ?? `HeyGen ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();
  const videoId: string = data?.data?.video_id;
  if (!videoId) throw new Error('HeyGen did not return a video_id');
  return videoId;
}

// GET /v1/video_status.get?video_id={id} → poll until completed / failed
export async function checkVideoStatus(
  videoId: string,
  apiKey: string,
): Promise<{
  status: 'pending' | 'processing' | 'completed' | 'failed' | string;
  videoUrl?: string;
  thumbnailUrl?: string;
  failureMessage?: string;
}> {
  const res = await fetch(
    `${HEYGEN_BASE}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`,
    { headers: heygenHeaders(apiKey) },
  );
  if (!res.ok) throw new Error(`HeyGen status poll ${res.status}`);
  const data = await res.json();
  return {
    status: data?.data?.status ?? 'unknown',
    videoUrl: data?.data?.video_url ?? undefined,
    thumbnailUrl: data?.data?.thumbnail_url ?? undefined,
    failureMessage: data?.data?.error?.message ?? undefined,
  };
}

// Trigger browser download of a completed video
export function downloadVideo(videoUrl: string, fileName: string): void {
  const a = document.createElement('a');
  a.href = videoUrl;
  a.download = fileName.endsWith('.mp4') ? fileName : `${fileName}.mp4`;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
