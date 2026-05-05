import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bell, User, LogOut, Settings,
  Upload, MailCheck, FileText, Video as VideoIcon,
  CheckCircle2, AlertCircle, Send, Sparkles,
} from 'lucide-react';
import {
  Activity, ActivityType,
  getActivities, getUnreadCount, markNotificationsRead, ACTIVITY_EVENT,
} from '@/services/dataService';

const TYPE_ICON: Record<ActivityType, typeof Bell> = {
  lead_uploaded:     Upload,
  lead_verified:     MailCheck,
  script_generated:  Sparkles,
  video_created:     VideoIcon,
  video_completed:   CheckCircle2,
  video_failed:      AlertCircle,
  campaign_started:  Send,
  campaign_completed: CheckCircle2,
};

const TYPE_COLOR: Record<ActivityType, string> = {
  lead_uploaded:     'text-blue-500',
  lead_verified:     'text-green-500',
  script_generated:  'text-purple-500',
  video_created:     'text-orange-500',
  video_completed:   'text-green-500',
  video_failed:      'text-destructive',
  campaign_started:  'text-primary',
  campaign_completed: 'text-green-500',
};

function formatTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function TopNavbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(() => {
    if (!user) return;
    setActivities(getActivities(user.id, 25));
    setUnread(getUnreadCount(user.id));
  }, [user]);

  // Initial load + live update on activity events + cross-tab via storage
  useEffect(() => {
    refresh();
    const onActivity = () => refresh();
    const onStorage = (e: StorageEvent) => {
      if (e.key && (e.key === 'hiring_ai_activities' || e.key.startsWith('hiring_ai_notifications_last_seen'))) {
        refresh();
      }
    };
    window.addEventListener(ACTIVITY_EVENT, onActivity);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(ACTIVITY_EVENT, onActivity);
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh]);

  // Refresh "time ago" labels every 30s without re-querying storage
  useEffect(() => {
    const interval = setInterval(() => setActivities(prev => [...prev]), 30_000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && user && unread > 0) {
      markNotificationsRead(user.id);
      setUnread(0);
    }
  };

  const navigateForType = (type: ActivityType) => {
    setOpen(false);
    if (type === 'lead_uploaded' || type === 'lead_verified') return navigate('/dashboard/leads');
    if (type === 'script_generated' || type === 'video_created' || type === 'video_completed' || type === 'video_failed') return navigate('/dashboard/videos');
    if (type === 'campaign_started' || type === 'campaign_completed') return navigate('/dashboard/campaigns');
  };

  return (
    <header className="h-16 border-b border-border bg-card px-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-foreground lg:hidden">
          Dashboard
        </h1>
      </div>

      <div className="flex items-center gap-3">
        {/* Notifications */}
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell className="w-5 h-5" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold">Notifications</p>
              {activities.length > 0 && (
                <span className="text-xs text-muted-foreground">{activities.length} recent</span>
              )}
            </div>

            {activities.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Upload leads or generate a video to get started.
                </p>
              </div>
            ) : (
              <ScrollArea className="max-h-96">
                <ul className="divide-y divide-border">
                  {activities.map(activity => {
                    const Icon = TYPE_ICON[activity.type] ?? Bell;
                    const color = TYPE_COLOR[activity.type] ?? 'text-muted-foreground';
                    return (
                      <li key={activity.id}>
                        <button
                          type="button"
                          onClick={() => navigateForType(activity.type)}
                          className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-start gap-3"
                        >
                          <span className={`mt-0.5 shrink-0 ${color}`}>
                            <Icon className="w-4 h-4" />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm leading-snug">{activity.message}</span>
                            <span className="block text-xs text-muted-foreground mt-0.5">
                              {formatTimeAgo(activity.timestamp)}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            )}
          </PopoverContent>
        </Popover>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
              <span className="hidden md:block text-sm font-medium max-w-[150px] truncate">
                {user?.name || user?.email}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div>
                <p className="font-medium">{user?.name}</p>
                <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/dashboard/settings')}>
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
