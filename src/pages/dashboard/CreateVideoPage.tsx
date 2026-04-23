import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Lead, Video } from '@/types/data';
import {
  getLeads, getVideos, saveVideo, updateVideo,
  getApiKey, addActivity,
} from '@/services/dataService';
import { generateScriptForLead } from '@/services/scriptGenerationService';
import { generateVideo, checkVideoStatus, downloadVideo } from '@/services/videoGenerationService';
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
  AlertCircle, Sparkles, Play, ChevronDown, ChevronUp,
  Settings, Download,
} from 'lucide-react';
import { toast } from 'sonner';

const POLL_INTERVAL_MS = 15_000;

type ScriptMap = Record<string, string>;

export default function CreateVideoPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [validLeads, setValidLeads] = useState<Lead[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [campaignDescription, setCampaignDescription] = useState('');

  const [scripts, setScripts] = useState<ScriptMap>({});
  const [expandedScripts, setExpandedScripts] = useState<Set<string>>(new Set());
  const [isGeneratingScripts, setIsGeneratingScripts] = useState(false);
  const [scriptProgress, setScriptProgress] = useState<{ current: number; total: number } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load ─────────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!user) return;
    const [leads, vids] = await Promise.all([getLeads(user.id), getVideos(user.id)]);
    setValidLeads(leads.filter(l => l.status === 'valid'));
    setVideos(vids);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Polling: check HeyGen status every 15s ───────────────────────────────────

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
      if (!video.heygenVideoId) return;
      try {
        const result = await checkVideoStatus(video.heygenVideoId, apiKey);
        if (result.status === 'completed' && result.videoUrl) {
          await updateVideo(video.id, {
            status: 'completed',
            videoUrl: result.videoUrl,
            thumbnailUrl: result.thumbnailUrl,
          });
        } else if (result.status === 'failed') {
          await updateVideo(video.id, {
            status: 'failed',
            errorMessage: result.failureMessage ?? 'HeyGen rendering failed',
          });
        }
      } catch { /* keep polling */ }
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
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [videos, runPoll]);

  // ── Lead selection ────────────────────────────────────────────────────────────

  const toggleLead = (id: string) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAll = () =>
    setSelectedIds(prev =>
      prev.size === validLeads.length ? new Set() : new Set(validLeads.map(l => l.id)));

  // ── Settings key check helper ─────────────────────────────────────────────────

  const requireKey = async (service: string, label: string): Promise<string | null> => {
    const key = await getApiKey(user!.id, service);
    if (!key) {
      toast.error(`${label} is missing`, {
        description: 'Add it in Settings before proceeding.',
        action: { label: 'Open Settings', onClick: () => navigate('/dashboard/settings') },
      });
      return null;
    }
    return key;
  };

  // ── Step 1: Generate scripts via Gemini ───────────────────────────────────────

  const handleGenerateScripts = async () => {
    if (selectedIds.size === 0) return toast.error('Select at least one lead');
    if (!campaignDescription.trim()) return toast.error('Enter a campaign description first');
    const key = await requireKey('gemini', 'Gemini API Key');
    if (!key) return;

    const leads = validLeads.filter(l => selectedIds.has(l.id));
    setIsGeneratingScripts(true);
    setScriptProgress({ current: 0, total: leads.length });

    const newScripts: ScriptMap = { ...scripts };
    for (const lead of leads) {
      try {
        newScripts[lead.id] = await generateScriptForLead(lead, campaignDescription, key);
      } catch (e) {
        toast.error(`Script failed for ${lead.firstName}: ${e instanceof Error ? e.message : 'error'}`);
      }
      setScriptProgress(prev => prev ? { ...prev, current: prev.current + 1 } : null);
    }

    setScripts(newScripts);
    setIsGeneratingScripts(false);
    setScriptProgress(null);
    toast.success(`${Object.keys(newScripts).length} scripts generated`);
  };

  // ── Step 2: Submit to HeyGen v2/video/generate ────────────────────────────────

  const handleSubmitToHeygen = async () => {
    const toSubmit = Array.from(selectedIds).filter(id => scripts[id]);
    if (toSubmit.length === 0) return toast.error('Generate scripts first');

    // Require mandatory keys
    const heygenKey     = await requireKey('heygen',           'HeyGen API Key');
    if (!heygenKey) return;
    const avatarId      = await requireKey('heygen_avatar_id', 'HeyGen Avatar ID');
    if (!avatarId) return;
    const voiceId       = await requireKey('heygen_voice_id',  'HeyGen Voice ID');
    if (!voiceId) return;

    // Load optional settings (fall back to defaults if not set)
    const [avatarStyle, bgAssetId, voiceEmotion, voiceSpeedRaw] = await Promise.all([
      getApiKey(user!.id, 'heygen_avatar_style'),
      getApiKey(user!.id, 'heygen_background_asset_id'),
      getApiKey(user!.id, 'heygen_voice_emotion'),
      getApiKey(user!.id, 'heygen_voice_speed'),
    ]);

    const options = {
      avatarId,
      voiceId,
      backgroundAssetId: bgAssetId ?? undefined,
      avatarStyle: avatarStyle ?? 'circle',
      voiceEmotion: voiceEmotion ?? 'Excited',
      voiceSpeed: voiceSpeedRaw ? parseFloat(voiceSpeedRaw) : 1,
    };

    setIsSubmitting(true);
    const leads = validLeads.filter(l => toSubmit.includes(l.id));
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
        avatarId: options.avatarId,
        voiceId: options.voiceId,
        status: 'processing',
        createdAt: new Date().toISOString(),
      };

      try {
        // POST to HeyGen v2/video/generate → get video_id immediately
        const heygenVideoId = await generateVideo(script, heygenKey, options);
        video.heygenVideoId = heygenVideoId;
        await saveVideo(video);
        submitted++;
      } catch (e) {
        video.status = 'failed';
        video.errorMessage = e instanceof Error ? e.message : 'Submit failed';
        await saveVideo(video);
        toast.error(`Failed for ${lead.firstName}: ${video.errorMessage}`);
      }
    }

    addActivity({
      id: crypto.randomUUID(),
      type: 'video_created',
      message: `Submitted ${submitted} videos to HeyGen`,
      timestamp: new Date().toISOString(),
      userId: user!.id,
    });

    toast.success(`${submitted} video${submitted !== 1 ? 's' : ''} queued — polling every 15s`);
    await loadData();
    setIsSubmitting(false);
  };

  // ── Download helper ───────────────────────────────────────────────────────────

  const handleDownload = (video: Video) => {
    if (!video.videoUrl) return;
    downloadVideo(video.videoUrl, video.name);
    toast.success(`Downloading "${video.name}"…`);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const scriptsReady = Array.from(selectedIds).some(id => scripts[id]);
  const allSelected = validLeads.length > 0 && selectedIds.size === validLeads.length;

  const statusBadge = (status: Video['status']) => {
    const map: Record<Video['status'], { label: string; variant: 'secondary' | 'outline' | 'default' | 'destructive'; spin?: boolean }> = {
      pending:           { label: 'Pending',          variant: 'secondary' },
      generating_script: { label: 'Generating Script', variant: 'outline', spin: true },
      script_ready:      { label: 'Script Ready',      variant: 'secondary' },
      processing:        { label: 'Rendering…',        variant: 'outline', spin: true },
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
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Create Videos</h1>
          <p className="text-muted-foreground mt-1">
            Generate personalised scripts with Gemini, then render with HeyGen
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/dashboard/settings')}>
          <Settings className="w-4 h-4 mr-2" />API Settings
        </Button>
      </div>

      {/* Step 1: Campaign description */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Step 1 — Campaign Description
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Describe your offer. Gemini will personalise a script for every lead based on this. e.g. 'We help SaaS companies reduce churn by 40% using AI-powered onboarding...'"
            value={campaignDescription}
            onChange={e => setCampaignDescription(e.target.value)}
            rows={3}
          />
          <p className="text-xs text-muted-foreground mt-2">
            Avatar, voice, and API keys are loaded from{' '}
            <button className="underline text-primary hover:opacity-80" onClick={() => navigate('/dashboard/settings')}>
              Settings
            </button>.
          </p>
        </CardContent>
      </Card>

      {/* Step 2: Select leads */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Step 2 — Select Valid Leads ({validLeads.length})</CardTitle>
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
                    <TableHead className="w-10" />
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
                                const n = new Set(prev);
                                n.has(lead.id) ? n.delete(lead.id) : n.add(lead.id);
                                return n;
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
            : <><Sparkles className="w-4 h-4 mr-2" />Generate Scripts ({selectedIds.size})</>
          }
        </Button>
        <Button
          onClick={handleSubmitToHeygen}
          disabled={isSubmitting || !scriptsReady}
          size="lg"
        >
          {isSubmitting
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting to HeyGen…</>
            : <><VideoIcon className="w-4 h-4 mr-2" />Send to HeyGen</>
          }
        </Button>
      </div>

      {/* Generated videos table */}
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
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" asChild>
                              <a href={video.videoUrl} target="_blank" rel="noreferrer">
                                <Play className="w-4 h-4 mr-1" />Watch
                              </a>
                            </Button>
                            <Button size="sm" variant="default" onClick={() => handleDownload(video)}>
                              <Download className="w-4 h-4 mr-1" />Download
                            </Button>
                          </div>
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
