import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getCampaigns, getLeads, getVideos } from '@/services/dataService';
import { Campaign, Lead, Video } from '@/types/data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  FunnelChart, Funnel, LabelList,
} from 'recharts';
import {
  Users, CheckCircle2, Video as VideoIcon, Send,
  XCircle, Clock, Loader2,
} from 'lucide-react';

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const [allLeads, allVideos] = await Promise.all([
        getLeads(user.id),
        getVideos(user.id),
      ]);
      setLeads(allLeads);
      setVideos(allVideos);
      setCampaigns(getCampaigns(user.id));
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Derived counts ─────────────────────────────────────────────────────────

  const leadCounts = {
    total: leads.length,
    valid: leads.filter(l => l.status === 'valid').length,
    invalid: leads.filter(l => l.status === 'invalid').length,
    pending: leads.filter(l => l.status === 'uploaded' || l.status === 'verifying').length,
  };

  const videoCounts = {
    total: videos.length,
    completed: videos.filter(v => v.status === 'completed').length,
    processing: videos.filter(v => v.status === 'processing' || v.status === 'script_ready' || v.status === 'generating_script').length,
    failed: videos.filter(v => v.status === 'failed').length,
    pending: videos.filter(v => v.status === 'pending').length,
  };

  const campaignCounts = {
    total: campaigns.length,
    running: campaigns.filter(c => c.status === 'running').length,
    completed: campaigns.filter(c => c.status === 'completed').length,
    draft: campaigns.filter(c => c.status === 'draft').length,
  };

  // ── KPI cards ──────────────────────────────────────────────────────────────

  const kpiCards = [
    {
      label: 'Total Leads',
      value: leadCounts.total,
      sub: `${leadCounts.valid} verified`,
      icon: Users,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Valid Emails',
      value: leadCounts.valid,
      sub: leadCounts.total > 0
        ? `${Math.round((leadCounts.valid / leadCounts.total) * 100)}% of total`
        : '—',
      icon: CheckCircle2,
      color: 'text-green-500',
      bg: 'bg-green-500/10',
    },
    {
      label: 'Videos Generated',
      value: videoCounts.completed,
      sub: `${videoCounts.processing} in progress`,
      icon: VideoIcon,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
    },
    {
      label: 'Active Campaigns',
      value: campaignCounts.running,
      sub: `${campaignCounts.completed} completed`,
      icon: Send,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
    },
  ];

  // ── Chart data ─────────────────────────────────────────────────────────────

  // Funnel: pipeline stages
  const funnelData = [
    { name: 'Leads Uploaded', value: leadCounts.total, fill: 'hsl(var(--primary))' },
    { name: 'Emails Verified', value: leadCounts.valid, fill: 'hsl(245 58% 60%)' },
    { name: 'Videos Created', value: videoCounts.completed, fill: 'hsl(245 58% 68%)' },
    { name: 'Campaigns Sent', value: campaignCounts.running + campaignCounts.completed, fill: 'hsl(245 58% 76%)' },
  ];

  // Donut: lead verification breakdown
  const leadPieData = [
    { name: 'Valid', value: leadCounts.valid, color: '#22c55e' },
    { name: 'Invalid', value: leadCounts.invalid, color: '#ef4444' },
    { name: 'Pending', value: leadCounts.pending, color: '#94a3b8' },
  ].filter(d => d.value > 0);

  // Bar: video job statuses
  const videoBarData = [
    { name: 'Completed', value: videoCounts.completed, fill: '#22c55e' },
    { name: 'Processing', value: videoCounts.processing, fill: 'hsl(var(--primary))' },
    { name: 'Pending', value: videoCounts.pending, fill: '#94a3b8' },
    { name: 'Failed', value: videoCounts.failed, fill: '#ef4444' },
  ];

  // Bar: campaign statuses
  const campaignBarData = [
    { name: 'Draft', value: campaignCounts.draft, fill: '#94a3b8' },
    { name: 'Running', value: campaignCounts.running, fill: 'hsl(var(--primary))' },
    { name: 'Completed', value: campaignCounts.completed, fill: '#22c55e' },
  ];

  const tooltipStyle = {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    fontSize: '12px',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground mt-1">Real-time overview of your outreach pipeline</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="text-3xl font-bold mt-1">{card.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
                </div>
                <div className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}>
                  <card.icon className={`w-6 h-6 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty state */}
      {leads.length === 0 && videos.length === 0 && campaigns.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No data yet</p>
            <p className="text-muted-foreground text-sm mt-1">
              Upload leads and start a campaign to see analytics here.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Pipeline Funnel + Lead breakdown */}
      {leads.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Funnel */}
          <Card>
            <CardHeader>
              <CardTitle>Outreach Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <FunnelChart>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Funnel dataKey="value" data={funnelData} isAnimationActive>
                      <LabelList
                        position="center"
                        fill="#fff"
                        fontSize={12}
                        formatter={(v: number) => (v > 0 ? v : '')}
                      />
                    </Funnel>
                  </FunnelChart>
                </ResponsiveContainer>
              </div>
              {/* Legend */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
                {funnelData.map(d => (
                  <span key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: d.fill }} />
                    {d.name} ({d.value})
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Lead verification donut */}
          <Card>
            <CardHeader>
              <CardTitle>Email Verification Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {leadPieData.length > 0 ? (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={leadPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={110}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {leadPieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend
                        formatter={(value, entry: any) =>
                          `${value} (${entry.payload.value})`
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[280px]">
                  <div className="text-center">
                    <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No verification data yet</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Video + Campaign status bars */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Video job statuses */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <VideoIcon className="w-5 h-5 text-muted-foreground" />
              Video Job Statuses
            </CardTitle>
          </CardHeader>
          <CardContent>
            {videos.length > 0 ? (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={videoBarData} barSize={40}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]}>
                      {videoBarData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[220px]">
                <div className="text-center">
                  <VideoIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No videos yet</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Campaign statuses */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-muted-foreground" />
              Campaign Statuses
            </CardTitle>
          </CardHeader>
          <CardContent>
            {campaigns.length > 0 ? (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={campaignBarData} barSize={40}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]}>
                      {campaignBarData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[220px]">
                <div className="text-center">
                  <Send className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No campaigns yet</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick stats table */}
      {(leads.length > 0 || videos.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Pipeline Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-3 gap-6">
              {/* Leads */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Leads</p>
                {[
                  { label: 'Total Uploaded', value: leadCounts.total, icon: Users, color: 'text-blue-500' },
                  { label: 'Valid', value: leadCounts.valid, icon: CheckCircle2, color: 'text-green-500' },
                  { label: 'Invalid', value: leadCounts.invalid, icon: XCircle, color: 'text-red-500' },
                  { label: 'Pending', value: leadCounts.pending, icon: Clock, color: 'text-muted-foreground' },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm">
                      <row.icon className={`w-4 h-4 ${row.color}`} />
                      {row.label}
                    </span>
                    <span className="font-semibold">{row.value}</span>
                  </div>
                ))}
              </div>

              {/* Videos */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Videos</p>
                {[
                  { label: 'Total', value: videoCounts.total, icon: VideoIcon, color: 'text-purple-500' },
                  { label: 'Completed', value: videoCounts.completed, icon: CheckCircle2, color: 'text-green-500' },
                  { label: 'Processing', value: videoCounts.processing, icon: Loader2, color: 'text-blue-500' },
                  { label: 'Failed', value: videoCounts.failed, icon: XCircle, color: 'text-red-500' },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm">
                      <row.icon className={`w-4 h-4 ${row.color}`} />
                      {row.label}
                    </span>
                    <span className="font-semibold">{row.value}</span>
                  </div>
                ))}
              </div>

              {/* Campaigns */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Campaigns</p>
                {[
                  { label: 'Total', value: campaignCounts.total, icon: Send, color: 'text-orange-500' },
                  { label: 'Running', value: campaignCounts.running, icon: Loader2, color: 'text-blue-500' },
                  { label: 'Completed', value: campaignCounts.completed, icon: CheckCircle2, color: 'text-green-500' },
                  { label: 'Draft', value: campaignCounts.draft, icon: Clock, color: 'text-muted-foreground' },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm">
                      <row.icon className={`w-4 h-4 ${row.color}`} />
                      {row.label}
                    </span>
                    <span className="font-semibold">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
