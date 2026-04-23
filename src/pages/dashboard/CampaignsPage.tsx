import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Campaign, Lead, Video } from '@/types/data';
import {
  getCampaigns,
  saveCampaign,
  getLeads,
  getVideos,
  triggerCampaign,
  addActivity,
} from '@/services/dataService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  Send,
  Loader2,
  Play,
  CheckCircle2,
  Clock,
  FileEdit,
} from 'lucide-react';
import { toast } from 'sonner';

export default function CampaignsPage() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    selectedLeads: 'all',
    videoId: '',
    scheduledAt: '',
  });

  const loadData = useCallback(async () => {
    if (user) {
      const [allLeads, allVideos] = await Promise.all([
        getLeads(user.id),
        getVideos(user.id),
      ]);
      setCampaigns(getCampaigns(user.id));
      setLeads(allLeads.filter(l => l.status === 'valid'));
      setVideos(allVideos.filter(v => v.status === 'completed'));
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async () => {
    if (!formData.name || !formData.videoId) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsCreating(true);

    const leadIds = formData.selectedLeads === 'all'
      ? leads.map(l => l.id)
      : leads.slice(0, 10).map(l => l.id);

    const campaign: Campaign = {
      id: crypto.randomUUID(),
      userId: user!.id,
      name: formData.name,
      leadIds,
      videoId: formData.videoId,
      status: formData.scheduledAt ? 'scheduled' : 'draft',
      scheduledAt: formData.scheduledAt || undefined,
      createdAt: new Date().toISOString(),
    };

    saveCampaign(campaign);
    addActivity({
      id: crypto.randomUUID(),
      type: 'campaign_started',
      message: `Created campaign: ${formData.name}`,
      timestamp: new Date().toISOString(),
      userId: user!.id,
    });

    toast.success('Campaign created successfully');
    setFormData({ name: '', selectedLeads: 'all', videoId: '', scheduledAt: '' });
    setIsOpen(false);
    loadData();
    setIsCreating(false);
  };

  const handleStartCampaign = async (campaignId: string) => {
    await triggerCampaign(campaignId);
    toast.success('Campaign started');
    loadData();
  };

  const statusBadge = (status: Campaign['status']) => {
    const config = {
      draft: { label: 'Draft', icon: FileEdit, className: 'bg-muted text-muted-foreground' },
      scheduled: { label: 'Scheduled', icon: Clock, className: 'bg-warning/10 text-warning' },
      running: { label: 'Running', icon: Play, className: 'bg-primary/10 text-primary' },
      completed: { label: 'Completed', icon: CheckCircle2, className: 'bg-success/10 text-success' },
    };
    const { label, icon: Icon, className } = config[status];
    return (
      <Badge variant="outline" className={`flex items-center gap-1 ${className}`}>
        <Icon className="w-3 h-3" />
        {label}
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
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create Campaign</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Campaign Name</Label>
                <Input
                  id="name"
                  placeholder="Q1 Outreach"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Select Leads</Label>
                <Select
                  value={formData.selectedLeads}
                  onValueChange={(v) => setFormData({ ...formData, selectedLeads: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Verified Leads ({leads.length})</SelectItem>
                    <SelectItem value="first10">First 10 Leads</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Select Video</Label>
                <Select
                  value={formData.videoId}
                  onValueChange={(v) => setFormData({ ...formData, videoId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a video" />
                  </SelectTrigger>
                  <SelectContent>
                    {videos.length > 0 ? (
                      videos.map((video) => (
                        <SelectItem key={video.id} value={video.id}>
                          {video.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" disabled>
                        No videos available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="schedule">Schedule (Optional)</Label>
                <Input
                  id="schedule"
                  type="datetime-local"
                  value={formData.scheduledAt}
                  onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                />
              </div>

              <Button
                className="w-full"
                onClick={handleCreate}
                disabled={isCreating || !formData.name || !formData.videoId}
              >
                {isCreating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Create Campaign
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Campaigns', value: campaigns.length },
          { label: 'Draft', value: campaigns.filter(c => c.status === 'draft').length },
          { label: 'Running', value: campaigns.filter(c => c.status === 'running').length },
          { label: 'Completed', value: campaigns.filter(c => c.status === 'completed').length },
        ].map((stat, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className="text-3xl font-bold mt-1">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Campaigns Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          {campaigns.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Leads</TableHead>
                    <TableHead>Video</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((campaign) => {
                    const video = videos.find(v => v.id === campaign.videoId);
                    return (
                      <TableRow key={campaign.id}>
                        <TableCell className="font-medium">{campaign.name}</TableCell>
                        <TableCell>{campaign.leadIds.length} leads</TableCell>
                        <TableCell>{video?.name || 'Unknown'}</TableCell>
                        <TableCell>{statusBadge(campaign.status)}</TableCell>
                        <TableCell>{new Date(campaign.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          {campaign.status === 'draft' && (
                            <Button
                              size="sm"
                              onClick={() => handleStartCampaign(campaign.id)}
                            >
                              <Play className="w-4 h-4 mr-1" />
                              Start
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No campaigns yet. Create your first campaign to get started.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
