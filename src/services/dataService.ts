import { Lead, Video, Campaign, Analytics } from '@/types/data';
import { supabase } from '@/lib/supabase';

// ─── localStorage keys (campaigns, activities remain local for now) ──────────
const CAMPAIGNS_KEY = 'hiring_ai_campaigns';
const ACTIVITIES_KEY = 'hiring_ai_activities';

export type ActivityType =
  | 'lead_uploaded'
  | 'lead_verified'
  | 'script_generated'
  | 'video_created'
  | 'video_completed'
  | 'video_failed'
  | 'campaign_started'
  | 'campaign_completed';

export interface Activity {
  id: string;
  type: ActivityType;
  message: string;
  timestamp: string;
  userId: string;
}

const NOTIFICATIONS_LAST_SEEN_KEY = 'hiring_ai_notifications_last_seen';
export const ACTIVITY_EVENT = 'hiring_ai:activity';

function getFromStorage<T>(key: string): T[] {
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : [];
}

function saveToStorage<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// ─── DB row ↔ Lead mapping ────────────────────────────────────────────────────

function toLead(row: Record<string, unknown>): Lead {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    firstName: (row.first_name as string) || '',
    lastName: (row.last_name as string) || '',
    email: row.email as string,
    company: (row.company as string) || '',
    website: (row.website as string) || '',
    companyDescription: (row.company_description as string) || '',
    status: row.status as Lead['status'],
    verificationCode: row.verification_code as Lead['verificationCode'],
    verificationMessage: row.verification_message as string | undefined,
    mxServer: row.mx_server as string | undefined,
    verifiedAt: row.verified_at as string | undefined,
    createdAt: row.created_at as string,
  };
}

// ─── LEADS (Supabase) ─────────────────────────────────────────────────────────

export async function getLeads(userId: string): Promise<Lead[]> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toLead);
}

export async function saveLeads(newLeads: Lead[]): Promise<void> {
  const rows = newLeads.map(l => ({
    id: l.id,
    user_id: l.userId,
    first_name: l.firstName,
    last_name: l.lastName,
    email: l.email,
    company: l.company,
    website: l.website,
    company_description: l.companyDescription,
    status: l.status,
    created_at: l.createdAt,
  }));
  const { error } = await supabase.from('leads').insert(rows);
  if (error) throw error;
}

export async function updateLead(id: string, updates: Partial<Lead>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (updates.status !== undefined)              row.status = updates.status;
  if (updates.verificationCode !== undefined)    row.verification_code = updates.verificationCode;
  if (updates.verificationMessage !== undefined) row.verification_message = updates.verificationMessage;
  if (updates.mxServer !== undefined)            row.mx_server = updates.mxServer;
  if (updates.verifiedAt !== undefined)          row.verified_at = updates.verifiedAt;
  const { error } = await supabase.from('leads').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteLead(id: string): Promise<void> {
  const { error } = await supabase.from('leads').delete().eq('id', id);
  if (error) throw error;
}

// ─── API KEYS (Supabase) ──────────────────────────────────────────────────────

export async function getApiKey(userId: string, service: string): Promise<string | null> {
  const { data } = await supabase
    .from('api_keys')
    .select('key_value')
    .eq('user_id', userId)
    .eq('service', service)
    .maybeSingle();
  return data?.key_value ?? null;
}

export async function saveApiKey(userId: string, service: string, keyValue: string): Promise<void> {
  const { error } = await supabase.from('api_keys').upsert({
    user_id: userId,
    service,
    key_value: keyValue,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,service' });
  if (error) throw error;
}

// ─── VIDEOS (Supabase) ───────────────────────────────────────────────────────

function toVideo(row: Record<string, unknown>): Video {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    leadId: row.lead_id as string,
    name: (row.name as string) || '',
    script: (row.script as string) || '',
    avatarId: row.avatar_id as string | undefined,
    voiceId: row.voice_id as string | undefined,
    heygenSessionId: row.heygen_session_id as string | undefined,
    heygenVideoId: row.heygen_video_id as string | undefined,
    status: row.status as Video['status'],
    videoUrl: row.video_url as string | undefined,
    thumbnailUrl: row.thumbnail_url as string | undefined,
    errorMessage: row.error_message as string | undefined,
    createdAt: row.created_at as string,
  };
}

export async function getVideos(userId: string): Promise<Video[]> {
  const { data, error } = await supabase
    .from('videos')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toVideo);
}

export async function saveVideo(video: Video): Promise<void> {
  const { error } = await supabase.from('videos').insert({
    id: video.id,
    user_id: video.userId,
    lead_id: video.leadId,
    name: video.name,
    script: video.script,
    avatar_id: video.avatarId,
    voice_id: video.voiceId,
    heygen_video_id: video.heygenVideoId,
    status: video.status,
    created_at: video.createdAt,
  });
  if (error) throw error;
}

export async function updateVideo(id: string, updates: Partial<Video>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (updates.status !== undefined)           row.status = updates.status;
  if (updates.script !== undefined)           row.script = updates.script;
  if (updates.heygenSessionId !== undefined)  row.heygen_session_id = updates.heygenSessionId;
  if (updates.heygenVideoId !== undefined)    row.heygen_video_id = updates.heygenVideoId;
  if (updates.videoUrl !== undefined)         row.video_url = updates.videoUrl;
  if (updates.thumbnailUrl !== undefined)     row.thumbnail_url = updates.thumbnailUrl;
  if (updates.errorMessage !== undefined)     row.error_message = updates.errorMessage;
  const { error } = await supabase.from('videos').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteVideo(id: string): Promise<void> {
  const { error } = await supabase.from('videos').delete().eq('id', id);
  if (error) throw error;
}

// ─── CAMPAIGNS (localStorage) ─────────────────────────────────────────────────

export function getCampaigns(userId: string): Campaign[] {
  return getFromStorage<Campaign>(CAMPAIGNS_KEY).filter(c => c.userId === userId);
}

export function saveCampaign(campaign: Campaign): void {
  const campaigns = getFromStorage<Campaign>(CAMPAIGNS_KEY);
  campaigns.push(campaign);
  saveToStorage(CAMPAIGNS_KEY, campaigns);
}

export function updateCampaign(id: string, updates: Partial<Campaign>): void {
  const campaigns = getFromStorage<Campaign>(CAMPAIGNS_KEY);
  const i = campaigns.findIndex(c => c.id === id);
  if (i !== -1) {
    campaigns[i] = { ...campaigns[i], ...updates };
    saveToStorage(CAMPAIGNS_KEY, campaigns);
  }
}

export function deleteCampaign(id: string): void {
  saveToStorage(CAMPAIGNS_KEY, getFromStorage<Campaign>(CAMPAIGNS_KEY).filter(c => c.id !== id));
}

// ─── ACTIVITIES (localStorage) ────────────────────────────────────────────────

export function getActivities(userId: string, limit = 10): Activity[] {
  const sorted = getFromStorage<Activity>(ACTIVITIES_KEY)
    .filter(a => a.userId === userId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return limit > 0 ? sorted.slice(0, limit) : sorted;
}

export function addActivity(activity: Activity): void {
  const activities = getFromStorage<Activity>(ACTIVITIES_KEY);
  activities.push(activity);
  saveToStorage(ACTIVITIES_KEY, activities);
  // Broadcast so TopNavbar (or anything else) can refresh without a re-render hack
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT, { detail: activity }));
  }
}

// ─── NOTIFICATIONS (last-seen tracking) ──────────────────────────────────────

function lastSeenKey(userId: string): string {
  return `${NOTIFICATIONS_LAST_SEEN_KEY}:${userId}`;
}

export function getNotificationsLastSeen(userId: string): string | null {
  return localStorage.getItem(lastSeenKey(userId));
}

export function markNotificationsRead(userId: string): void {
  localStorage.setItem(lastSeenKey(userId), new Date().toISOString());
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT));
  }
}

export function getUnreadCount(userId: string): number {
  const lastSeen = getNotificationsLastSeen(userId);
  const all = getActivities(userId, 0);
  if (!lastSeen) return all.length;
  const lastSeenMs = new Date(lastSeen).getTime();
  return all.filter(a => new Date(a.timestamp).getTime() > lastSeenMs).length;
}

// ─── ANALYTICS ────────────────────────────────────────────────────────────────

export async function getAnalytics(userId: string): Promise<Analytics> {
  const [
    { count: totalLeads },
    { count: verifiedEmails },
  ] = await Promise.all([
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'valid'),
  ]);

  const [videos, campaigns] = await Promise.all([
    getVideos(userId),
    Promise.resolve(getCampaigns(userId)),
  ]);
  const activeCampaigns = campaigns.filter(c => c.status === 'running').length;

  return {
    totalLeads: totalLeads ?? 0,
    verifiedEmails: verifiedEmails ?? 0,
    activeCampaigns,
    videosGenerated: videos.length,
    emailOpenRate: campaigns.length > 0 ? Math.round(Math.random() * 40 + 20) : 0,
    videoWatchRate: campaigns.length > 0 ? Math.round(Math.random() * 30 + 15) : 0,
    replyRate: campaigns.length > 0 ? Math.round(Math.random() * 15 + 5) : 0,
  };
}

// ─── Legacy stubs (kept for other pages not yet migrated) ────────────────────

export async function triggerVideoGeneration(videoId: string, script: string, avatar: string): Promise<{ success: boolean }> {
  console.log('Triggering video generation:', { videoId, script, avatar });
  await new Promise(resolve => setTimeout(resolve, 3000));
  updateVideo(videoId, { status: 'completed', videoUrl: 'https://example.com/video.mp4' });
  return { success: true };
}

export async function triggerCampaign(campaignId: string): Promise<{ success: boolean }> {
  console.log('Triggering campaign:', campaignId);
  updateCampaign(campaignId, { status: 'running' });
  return { success: true };
}
