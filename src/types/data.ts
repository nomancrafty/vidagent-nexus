export interface Lead {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  website: string;
  companyDescription: string;
  status: 'uploaded' | 'verifying' | 'valid' | 'invalid';
  verificationCode?: 'ok' | 'ko' | 'mb';
  verificationMessage?: string;
  mxServer?: string;
  verifiedAt?: string;
  createdAt: string;
  csvBatchId?: string;
  csvFileName?: string;
}

export interface Video {
  id: string;
  userId: string;
  leadId: string;
  name: string;
  script: string;
  avatarId?: string;
  voiceId?: string;
  heygenSessionId?: string;
  heygenVideoId?: string;
  status: 'pending' | 'generating_script' | 'script_ready' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  thumbnailUrl?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface Campaign {
  id: string;
  userId: string;
  name: string;
  leadIds: string[];
  videoId: string;
  status: 'draft' | 'scheduled' | 'running' | 'completed';
  scheduledAt?: string;
  createdAt: string;
}

export interface Analytics {
  totalLeads: number;
  verifiedEmails: number;
  activeCampaigns: number;
  videosGenerated: number;
  emailOpenRate: number;
  videoWatchRate: number;
  replyRate: number;
}
