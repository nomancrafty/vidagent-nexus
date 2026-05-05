import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Lead, Video } from '@/types/data';
import {
  getLeads, getVideos, saveVideo, updateVideo,
  getApiKey, addActivity,
} from '@/services/dataService';
import { generateScriptForLead } from '@/services/scriptGenerationService';
import { generateVideo, pollVideoStatus } from '@/services/videoGenerationService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Video as VideoIcon, Loader2, CheckCircle2, Clock,
  AlertCircle, Sparkles, Play, ChevronDown, ChevronUp, Settings,
} from 'lucide-react';
import { toast } from 'sonner';

const POLL_INTERVAL_MS = 15_000;

type ScriptMap = Record<string, string>; // leadId → script

export default function CreateVideoPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Data
  const [validLeads, setValidLeads] = useState<Lead[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Campaign config
  const [campaignDescription, setCampaignDescription] = useState('');

  // Script step
  const [scripts, setScripts] = useState<ScriptMap>({});
  const [expandedScripts, setExpandedScripts] = useState<Set<string>>(new Set());
  const [isGeneratingScripts, setIsGeneratingScripts] = useState(false);
  const [scriptProgress, setScriptProgress] = useState<{ current: number; total: number } | null>(null);

  // Video step
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load data ────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!user) return;
    const [leads, vids] = await Promise.all([
      getLeads(user.id),
      getVideos(user.id),
    ]);
    setValidLeads(leads.filter(l => l.status === 'valid'));
    setVideos(vids);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Polling ──────────────────────────────────────────────────────────────────

  const runPoll = useCallback(async () => {
    if (!user) return;
    const current = await getVideos(user.id);
    const processing = current.filter(v => v.status === 'processing');
    if (processing.length === 0) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
      setVideos(current);
      return;
    }
    const apiKey = await getApiKey(user.id, 'heygen');
    if (!apiKey) return;

    await Promise.all(processing.map(async (video) => {
      if (!video.heygenVideoId) {
        console.warn('[Poll] Skipping video — no heygenVideoId saved:', video.id);
        return;
      }
      try {
        const result = await pollVideoStatus(video.heygenVideoId, apiKey);
        console.log('[Poll]', video.heygenVideoId, '→ status:', result.status);
        if (result.status === 'completed') {
          await updateVideo(video.id, {
            status: 'completed',
            videoUrl: result.videoUrl,
            thumbnailUrl: result.thumbnailUrl,
          });
          addActivity({
            id: crypto.randomUUID(),
            type: 'video_completed',
            message: `Video ready: ${video.name}`,
            timestamp: new Date().toISOString(),
            userId: user.id,
          });
        } else if (result.status === 'failed') {
          await updateVideo(video.id, { status: 'failed', errorMessage: result.error });
          addActivity({
            id: crypto.randomUUID(),
            type: 'video_failed',
            message: `Video failed: ${video.name}${result.error ? ` — ${result.error}` : ''}`,
            timestamp: new Date().toISOString(),
            userId: user.id,
          });
        }
      } catch (e) {
        console.error('[Poll] Error polling', video.heygenVideoId, e);
      }
    }));

    const updated = await getVideos(user.id);
    setVideos(updated);
  }, [user]);

  useEffect(() => {
    const hasProcessing = videos.some(v => v.status === 'processing');
    if (hasProcessing && !pollingRef.current) {
      pollingRef.current = setInterval(runPoll, POLL_INTERVAL_MS);
    }
    if (!hasProcessing && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [videos, runPoll]);

  // ── Lead selection ───────────────────────────────────────────────────────────

  const toggleLead = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds(prev =>
      prev.size === validLeads.length ? new Set() : new Set(validLeads.map(l => l.id)),
    );
  };

  // ── Settings check helper ────────────────────────────────────────────────────

  const requireKey = async (service: string, label: string): Promise<string | null> => {
    const key = await getApiKey(user!.id, service);
    if (!key) {
      toast.error(`${label} is missing`, {
        description: 'Add it in Settings before proceeding.',
        action: {
          label: 'Open Settings',
          onClick: () => navigate('/dashboard/settings'),
        },
      });
      return null;
    }
    return key;
  };

  // ── Script generation (Gemini) ───────────────────────────────────────────────

  const handleGenerateScripts = async () => {
    if (selectedIds.size === 0) return toast.error('Select at least one lead');
    if (!campaignDescription.trim()) return toast.error('Enter a campaign description first');

    const key = await requireKey('gemini', 'Gemini API Key');
    if (!key) return;

    runScriptGeneration(Array.from(selectedIds), campaignDescription, key);
  };

  const runScriptGeneration = async (leadIds: string[], description: string, apiKey: string) => {
    const leads = validLeads.filter(l => leadIds.includes(l.id));
    setIsGeneratingScripts(true);
    setScriptProgress({ current: 0, total: leads.length });

    const newScripts: ScriptMap = { ...scripts };
    for (const lead of leads) {
      try {
        const script = await generateScriptForLead(lead, description, apiKey);
        newScripts[lead.id] = script;
      } catch (e) {
        toast.error(`Script failed for ${lead.firstName} ${lead.lastName}: ${e instanceof Error ? e.message : 'error'}`);
      }
      setScriptProgress(prev => prev ? { ...prev, current: prev.current + 1 } : null);
    }

    setScripts(newScripts);
    setIsGeneratingScripts(false);
    setScriptProgress(null);
    const generatedCount = leads.filter(l => newScripts[l.id]).length;
    if (generatedCount > 0) {
      addActivity({
        id: crypto.randomUUID(),
        type: 'script_generated',
        message: `Generated ${generatedCount} script${generatedCount === 1 ? '' : 's'} with Gemini`,
        timestamp: new Date().toISOString(),
        userId: user!.id,
      });
    }
    toast.success(`Generated ${Object.keys(newScripts).length} scripts`);
  };

  // ── HeyGen submission ────────────────────────────────────────────────────────

  const handleSubmitToHeygen = async () => {
    const toSubmit = Array.from(selectedIds).filter(id => scripts[id]);
    if (toSubmit.length === 0) return toast.error('Generate scripts first');

    const heygenKey = await requireKey('heygen', 'HeyGen API Key');
    if (!heygenKey) return;

    const voiceId = await requireKey('heygen_voice_id', 'HeyGen Voice ID');
    if (!voiceId) return;

    const avatarId = await getApiKey(user!.id, 'heygen_avatar_id');
    const talkingPhotoId = await getApiKey(user!.id, 'heygen_talking_photo_id');
    if (!avatarId && !talkingPhotoId) {
      toast.error('Avatar ID or Talking Photo ID required', {
        description: 'Add at least one in Settings.',
        action: { label: 'Open Settings', onClick: () => navigate('/dashboard/settings') },
      });
      return;
    }

    runHeygenSubmission(toSubmit, heygenKey, voiceId, avatarId ?? undefined, talkingPhotoId ?? undefined).catch(e => {
      console.error('[HeyGen] Unexpected error:', e);
      toast.error(`Unexpected error: ${e instanceof Error ? e.message : String(e)}`);
      setIsSubmitting(false);
    });
  };

  const runHeygenSubmission = async (
    leadIds: string[],
    apiKey: string,
    voiceId: string,
    avatarId?: string,
    talkingPhotoId?: string,
  ) => {
    setIsSubmitting(true);
    const leads = validLeads.filter(l => leadIds.includes(l.id));
    let submitted = 0;

    for (const lead of leads) {
      const script = scripts[lead.id];
      if (!script) continue;
      const video: Video = {
        id: crypto.randomUUID(),
        userId: user!.id,
        leadId: lead.id,
        name: `${lead.firstName} ${lead.lastName} — ${lead.company}`,
        script,
        avatarId: avatarId || undefined,
        voiceId: voiceId || undefined,
        status: 'processing',
        createdAt: new Date().toISOString(),
      };

      try {
        console.log('[HeyGen] Submitting for', lead.email, { avatarId, talkingPhotoId, voiceId });

        // Record the prospect's website and upload to HeyGen as background asset
        let videoAssetId: string | undefined;
        if (lead.website) {
          console.log('[Recorder] Recording website:', lead.website);
          const backendUrl = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';
          const recRes = await fetch(`${backendUrl}/api/recordings/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: lead.website, jobId: video.id, heygenApiKey: apiKey }),
          });
          if (!recRes.ok) {
            const recErr = await recRes.json().catch(() => ({}));
            throw new Error((recErr as { error?: string }).error ?? `Recording failed ${recRes.status}`);
          }
          const recData = await recRes.json() as { videoAssetId: string };
          videoAssetId = recData.videoAssetId;
          console.log('[Recorder] videoAssetId:', videoAssetId);
        }

        const videoId = await generateVideo(
          {
            avatarId: avatarId || undefined,
            talkingPhotoId: talkingPhotoId || undefined,
            voiceId: voiceId,
            inputText: script,
            videoAssetId,
          },
          apiKey,
        );
        console.log('[HeyGen] Got video_id:', videoId);
        video.heygenVideoId = videoId;
        await saveVideo(video);
        submitted++;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Submit failed';
        console.error('[HeyGen] Error for', lead.email, errMsg);
        video.status = 'failed';
        video.errorMessage = errMsg;
        toast.error(`Failed for ${lead.firstName}: ${errMsg}`);
        try { await saveVideo(video); } catch (dbErr) {
          console.error('[DB] saveVideo failed:', dbErr);
        }
      }
    }

    addActivity({
      id: crypto.randomUUID(),
      type: 'video_created',
      message: `Submitted ${submitted} videos to HeyGen`,
      timestamp: new Date().toISOString(),
      userId: user!.id,
    });

    toast.success(`${submitted} videos submitted — polling every 15s`);
    await loadData();
    setIsSubmitting(false);
  };

  // ── UI helpers ───────────────────────────────────────────────────────────────

  const scriptsReady = Array.from(selectedIds).some(id => scripts[id]);
  const allSelected = validLeads.length > 0 && selectedIds.size === validLeads.length;

  const statusBadge = (status: Video['status']) => {
    const map: Record<Video['status'], { label: string; variant: 'secondary' | 'outline' | 'default' | 'destructive'; spin?: boolean }> = {
      pending:           { label: 'Pending',          variant: 'secondary' },
      generating_script: { label: 'Generating Script', variant: 'outline', spin: true },
      script_ready:      { label: 'Script Ready',      variant: 'secondary' },
      processing:        { label: 'Processing',        variant: 'outline', spin: true },
      completed:         { label: 'Completed',         variant: 'default' },
      failed:            { label: 'Failed',            variant: 'destructive' },
    };
    const { label, variant, spin } = map[status];
    const Icon = spin ? Loader2 : status === 'completed' ? CheckCircle2 : status === 'failed' ? AlertCircle : Clock;
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        <Icon className={`w-3 h-3 ${spin ? 'animate-spin' : ''}`} /> {label}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Create Videos</h1>
          <p className="text-muted-foreground mt-1">Generate personalised scripts with Gemini, then render with HeyGen</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/dashboard/settings')}>
          <Settings className="w-4 h-4 mr-2" />
          API Settings
        </Button>
      </div>

      {/* Campaign description only */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Campaign Setup
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <label className="text-sm font-medium">
              Campaign Description <span className="text-destructive">*</span>
            </label>
            <Textarea
              placeholder="Describe what you offer. Gemini will use this to personalise each script. e.g. 'We help SaaS companies reduce churn by 40% using AI-powered onboarding...'"
              value={campaignDescription}
              onChange={e => setCampaignDescription(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground pt-1">
              API keys and avatar/voice IDs are loaded from{' '}
              <button
                className="underline text-primary hover:opacity-80"
                onClick={() => navigate('/dashboard/settings')}
              >
                Settings
              </button>
              .
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Lead selector */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Select Valid Leads ({validLeads.length})</CardTitle>
            {validLeads.length > 0 && (
              <Button variant="outline" size="sm" onClick={toggleAll}>
                {allSelected ? 'Deselect All' : 'Select All'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {validLeads.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">
              No valid leads yet — verify emails on the Leads page first.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Script</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validLeads.map(lead => (
                    <TableRow key={lead.id} className="cursor-pointer" onClick={() => toggleLead(lead.id)}>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Checkbox checked={selectedIds.has(lead.id)} onCheckedChange={() => toggleLead(lead.id)} />
                      </TableCell>
                      <TableCell className="font-medium">{lead.firstName} {lead.lastName}</TableCell>
                      <TableCell>{lead.email}</TableCell>
                      <TableCell>{lead.company}</TableCell>
                      <TableCell>
                        {scripts[lead.id] ? (
                          <button
                            className="flex items-center gap-1 text-xs text-primary"
                            onClick={e => {
                              e.stopPropagation();
                              setExpandedScripts(prev => {
                                const next = new Set(prev);
                                next.has(lead.id) ? next.delete(lead.id) : next.add(lead.id);
                                return next;
                              });
                            }}
                          >
                            {expandedScripts.has(lead.id) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            {expandedScripts.has(lead.id) ? 'Hide' : 'Preview'}
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Script preview rows */}
                  {validLeads.filter(l => expandedScripts.has(l.id) && scripts[l.id]).map(lead => (
                    <TableRow key={`script-${lead.id}`} className="bg-muted/30">
                      <TableCell colSpan={5} className="py-2 px-4">
                        <Textarea
                          className="text-sm min-h-[80px] bg-background"
                          value={scripts[lead.id]}
                          onChange={e => setScripts(prev => ({ ...prev, [lead.id]: e.target.value }))}
                          onClick={e => e.stopPropagation()}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={handleGenerateScripts}
          disabled={isGeneratingScripts || selectedIds.size === 0 || !campaignDescription.trim()}
          variant="outline"
          size="lg"
        >
          {isGeneratingScripts
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating {scriptProgress?.current}/{scriptProgress?.total}…</>
            : <><Sparkles className="w-4 h-4 mr-2" />Step 1: Generate Scripts ({selectedIds.size})</>
          }
        </Button>
        <Button
          onClick={handleSubmitToHeygen}
          disabled={isSubmitting || !scriptsReady}
          size="lg"
        >
          {isSubmitting
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting…</>
            : <><VideoIcon className="w-4 h-4 mr-2" />Step 2: Submit to HeyGen</>
          }
        </Button>
      </div>

      {/* Videos status table */}
      {videos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Generated Videos ({videos.length})
              {videos.some(v => v.status === 'processing') && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />Polling every 15s
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {videos.map(video => (
                    <TableRow key={video.id}>
                      <TableCell className="font-medium">{video.name}</TableCell>
                      <TableCell>{statusBadge(video.status)}</TableCell>
                      <TableCell className="text-sm text-destructive max-w-[200px] truncate">
                        {video.errorMessage ?? '—'}
                      </TableCell>
                      <TableCell>
                        {video.status === 'completed' && video.videoUrl && (
                          <Button size="sm" variant="outline" asChild>
                            <a href={video.videoUrl} target="_blank" rel="noreferrer">
                              <Play className="w-4 h-4 mr-1" />Watch
                            </a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
