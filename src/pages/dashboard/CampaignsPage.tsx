import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Campaign, Lead, Video } from '@/types/data';
import {
  getCampaigns, saveCampaign, updateCampaign,
  getLeads, getVideos, getApiKey, addActivity,
} from '@/services/dataService';
import {
  createList, createCampaign, bulkAddProspects, startCampaign,
  ManyReachProspect,
} from '@/services/manyreachService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Send, Loader2, Play, CheckCircle2, Clock, FileEdit, Settings } from 'lucide-react';
import { toast } from 'sonner';

const DEFAULT_SUBJECT = 'Quick idea for {{COMPANY}}';
const DEFAULT_BODY = `<p>Hi {{FIRST_NAME}},</p>
<p>I recorded a quick walkthrough of your website:</p>
<p><a href="{{ScreenshotURL}}">▶ Watch your personalised video</a></p>
<p>I noticed a few areas that could improve conversions — worth a quick chat?</p>`;

interface FormData {
  name: string;
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  subject: string;
  body: string;
  scheduledAt: string;
  dailyLimit: string;
}

export default function CampaignsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const [form, setForm] = useState<FormData>({
    name: '',
    fromEmail: '',
    fromName: '',
    replyToEmail: '',
    subject: DEFAULT_SUBJECT,
    body: DEFAULT_BODY,
    scheduledAt: '',
    dailyLimit: '50',
  });

  const set = (field: keyof FormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const loadData = useCallback(async () => {
    if (!user) return;
    const [allLeads, allVideos] = await Promise.all([getLeads(user.id), getVideos(user.id)]);
    setCampaigns(getCampaigns(user.id));
    setLeads(allLeads.filter(l => l.status === 'valid'));
    setVideos(allVideos.filter(v => v.status === 'completed'));
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Create & launch in ManyReach ──────────────────────────────────────────────

  const handleCreate = async () => {
    if (!form.name || !form.subject || !form.body) {
      toast.error('Fill in campaign name, subject, and body');
      return;
    }
    if (leads.length === 0) {
      toast.error('No verified leads — verify emails on the Leads page first');
      return;
    }

    const apiKey = await getApiKey(user!.id, 'manyreach');
    if (!apiKey) {
      toast.error('ManyReach API Key missing', {
        description: 'Add it in Settings.',
        action: { label: 'Open Settings', onClick: () => navigate('/dashboard/settings') },
      });
      return;
    }

    setIsCreating(true);
    const localId = crypto.randomUUID();

    try {
      // 1 — create mailing list
      toast.info('Creating mailing list…');
      const listId = await createList(form.name, apiKey);
      console.log('[ManyReach] listId:', listId);

      // 2 — create campaign with email template
      toast.info('Creating campaign…');
      const scheduledDate = form.scheduledAt ? new Date(form.scheduledAt) : null;
      const manyreachCampaignId = await createCampaign(
        {
          name: form.name,
          subject: form.subject,
          body: form.body,
          fromEmails: form.fromEmail || undefined,
          fromName: form.fromName || undefined,
          replyToEmail: form.replyToEmail || undefined,
          trackOpens: true,
          trackClicks: true,
          dailyLimit: Number(form.dailyLimit) || 50,
          ...(scheduledDate
            ? {
                scheduleSendOnDateEnabled: true,
                scheduleSendOnDate: scheduledDate.toISOString().split('T')[0],
                scheduleSendOnDateHours: scheduledDate.getHours(),
                scheduleSendOnDateMinutes: scheduledDate.getMinutes(),
                scheduleTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              }
            : {}),
        },
        apiKey,
      );
      console.log('[ManyReach] campaignId:', manyreachCampaignId);

      // 3 — build prospect list
      // CDN URL first, fall back to HeyGen app page URL
      // custom4 = "ScreenshotURL" variable in ManyReach
      const prospects: ManyReachProspect[] = leads
        .filter(lead => !!lead.email)
        .map(lead => {
          const video = videos.find(v => v.leadId === lead.id);
          const videoUrl = video?.videoUrl
            || (video?.heygenVideoId
              ? `https://app.heygen.com/videos/${video.heygenVideoId}--${video.heygenVideoId}`
              : '');
          const prospect: ManyReachProspect = { email: lead.email };
          if (lead.firstName) prospect.firstName = lead.firstName;
          if (lead.lastName)  prospect.lastName  = lead.lastName;
          if (lead.company)   prospect.company   = lead.company;
          if (lead.website)   prospect.website   = lead.website;
          if (videoUrl)       prospect.custom4   = videoUrl;
          return prospect;
        });

      if (prospects.length === 0) throw new Error('No valid prospects — ensure leads have email addresses');
      console.log('[ManyReach] prospects[0]:', prospects[0]);

      // 4 — bulk add prospects
      toast.info(`Uploading ${prospects.length} prospects…`);
      const importResult = await bulkAddProspects(listId, manyreachCampaignId, prospects, apiKey);
      console.log('[ManyReach] bulk import:', importResult);

      // 5 — start campaign
      toast.info('Starting campaign…');
      await startCampaign(manyreachCampaignId, apiKey);

      // Save locally for analytics later
      const campaign: Campaign = {
        id: localId,
        userId: user!.id,
        name: form.name,
        leadIds: leads.map(l => l.id),
        videoId: videos[0]?.id ?? '',
        status: scheduledDate ? 'scheduled' : 'running',
        scheduledAt: form.scheduledAt || undefined,
        createdAt: new Date().toISOString(),
        manyreachCampaignId,
        manyreachListId: listId,
      } as Campaign & { manyreachCampaignId: number; manyreachListId: number };
      saveCampaign(campaign);

      addActivity({
        id: crypto.randomUUID(),
        type: 'campaign_started',
        message: `Campaign "${form.name}" launched with ${prospects.length} prospects`,
        timestamp: new Date().toISOString(),
        userId: user!.id,
      });

      toast.success(`Campaign launched! ${importResult.campaignAdded ?? prospects.length} prospects enrolled.`);
      setForm({ name: '', fromEmail: '', fromName: '', replyToEmail: '', subject: DEFAULT_SUBJECT, body: DEFAULT_BODY, scheduledAt: '', dailyLimit: '50' });
      setIsOpen(false);
      loadData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ManyReach] Error:', msg);
      toast.error(`Campaign failed: ${msg}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleResume = async (campaign: Campaign & { manyreachCampaignId?: number }) => {
    if (!campaign.manyreachCampaignId) {
      toast.error('No ManyReach campaign ID — this campaign was created before ManyReach was wired up');
      return;
    }
    const apiKey = await getApiKey(user!.id, 'manyreach');
    if (!apiKey) { toast.error('ManyReach API key missing'); return; }
    try {
      await startCampaign(campaign.manyreachCampaignId, apiKey);
      updateCampaign(campaign.id, { status: 'running' });
      toast.success('Campaign resumed');
      loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to resume');
    }
  };

  const statusBadge = (status: Campaign['status']) => {
    const config = {
      draft:     { label: 'Draft',     icon: FileEdit,     cls: 'bg-muted text-muted-foreground' },
      scheduled: { label: 'Scheduled', icon: Clock,        cls: 'bg-yellow-500/10 text-yellow-600' },
      running:   { label: 'Running',   icon: Play,         cls: 'bg-primary/10 text-primary' },
      completed: { label: 'Completed', icon: CheckCircle2, cls: 'bg-green-500/10 text-green-600' },
    };
    const { label, icon: Icon, cls } = config[status] ?? config.draft;
    return (
      <Badge variant="outline" className={`flex items-center gap-1 ${cls}`}>
        <Icon className="w-3 h-3" />{label}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Campaigns</h1>
          <p className="text-muted-foreground mt-1">Manage your outreach campaigns</p>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />New Campaign</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create & Launch Campaign</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">

              {/* Campaign name */}
              <div className="space-y-1">
                <Label>Campaign Name <span className="text-destructive">*</span></Label>
                <Input placeholder="Q2 Outreach" value={form.name} onChange={set('name')} />
              </div>

              {/* Sender info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>From Email <span className="text-destructive">*</span></Label>
                  <Input placeholder="you@domain.com" value={form.fromEmail} onChange={set('fromEmail')} />
                </div>
                <div className="space-y-1">
                  <Label>From Name <span className="text-destructive">*</span></Label>
                  <Input placeholder="Your Name" value={form.fromName} onChange={set('fromName')} />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Reply-To Email</Label>
                <Input placeholder="Same as From Email if blank" value={form.replyToEmail} onChange={set('replyToEmail')} />
              </div>

              {/* Email template */}
              <div className="space-y-1">
                <Label>Subject <span className="text-destructive">*</span></Label>
                <Input value={form.subject} onChange={set('subject')} />
              </div>
              <div className="space-y-1">
                <Label>Email Body (HTML) <span className="text-destructive">*</span></Label>
                <p className="text-xs text-muted-foreground">Use <code>{'{{firstName}}'}</code>, <code>{'{{company}}'}</code>, <code>{'{{screenshotUrl}}'}</code> for the video link.</p>
                <Textarea rows={6} value={form.body} onChange={set('body')} className="font-mono text-xs" />
              </div>

              {/* Schedule + daily limit */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Schedule (optional)</Label>
                  <Input type="datetime-local" value={form.scheduledAt} onChange={set('scheduledAt')} />
                </div>
                <div className="space-y-1">
                  <Label>Daily Limit</Label>
                  <Input type="number" min={1} max={500} value={form.dailyLimit} onChange={set('dailyLimit')} />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {leads.length} verified leads · {videos.length} completed videos will be matched by lead.
              </p>

              <Button
                className="w-full"
                onClick={handleCreate}
                disabled={isCreating || !form.name || !form.subject || !form.body}
              >
                {isCreating
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Launching…</>
                  : <><Send className="w-4 h-4 mr-2" />Create & Start in ManyReach</>
                }
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Campaigns', value: campaigns.length },
          { label: 'Draft',     value: campaigns.filter(c => c.status === 'draft').length },
          { label: 'Running',   value: campaigns.filter(c => c.status === 'running').length },
          { label: 'Completed', value: campaigns.filter(c => c.status === 'completed').length },
        ].map((s, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="text-3xl font-bold mt-1">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Campaigns table */}
      <Card>
        <CardHeader>
          <CardTitle>All Campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <p className="text-muted-foreground">No campaigns yet.</p>
              <Button variant="outline" size="sm" onClick={() => navigate('/dashboard/settings')}>
                <Settings className="w-4 h-4 mr-2" />Check ManyReach API Key
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Leads</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map(campaign => (
                    <TableRow key={campaign.id}>
                      <TableCell className="font-medium">{campaign.name}</TableCell>
                      <TableCell>{campaign.leadIds.length} leads</TableCell>
                      <TableCell>{statusBadge(campaign.status)}</TableCell>
                      <TableCell>{new Date(campaign.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
                          <Button size="sm" variant="outline"
                            onClick={() => handleResume(campaign as Campaign & { manyreachCampaignId?: number })}>
                            <Play className="w-4 h-4 mr-1" />Start
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
