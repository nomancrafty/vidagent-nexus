import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Activity, getActivities } from '@/services/dataService';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Bell, User, LogOut, Settings,
  Upload, CheckCircle2, Video, Send, Check, Inbox,
} from 'lucide-react';

const REFRESH_INTERVAL_MS = 15_000;

const activityIcon = (type: Activity['type']) => {
  switch (type) {
    case 'lead_uploaded':      return <Upload className="w-4 h-4 text-blue-500" />;
    case 'lead_verified':      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'video_created':      return <Video className="w-4 h-4 text-purple-500" />;
    case 'campaign_started':   return <Send className="w-4 h-4 text-orange-500" />;
    case 'campaign_completed': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    default:                   return <Bell className="w-4 h-4 text-muted-foreground" />;
  }
};

const timeAgo = (iso: string): string => {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export function TopNavbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [open, setOpen] = useState(false);

  const readKey = user ? `notifications_last_read_${user.id}` : '';
  const [lastReadAt, setLastReadAt] = useState<string>(() =>
    readKey ? localStorage.getItem(readKey) ?? new Date(0).toISOString() : new Date(0).toISOString(),
  );

  const refresh = useCallback(() => {
    if (!user) return;
    setActivities(getActivities(user.id));
  }, [user]);

  // Load + poll for new activities
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // Refresh also when popover opens
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) refresh();
  };

  const unreadCount = useMemo(
    () => activities.filter(a => new Date(a.timestamp).getTime() > new Date(lastReadAt).getTime()).length,
    [activities, lastReadAt],
  );

  const markAllRead = () => {
    const now = new Date().toISOString();
    if (readKey) localStorage.setItem(readKey, now);
    setLastReadAt(now);
  };

  return (
    <header className="h-16 border-b border-border bg-card px-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-foreground lg:hidden">Dashboard</h1>
      </div>

      <div className="flex items-center gap-3">
        {/* Notifications */}
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-destructive rounded-full text-[10px] font-semibold text-destructive-foreground flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[360px] p-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">Notifications</h3>
                {unreadCount > 0 && (
                  <Badge variant="secondary" className="text-xs">{unreadCount} new</Badge>
                )}
              </div>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="text-xs h-auto px-2 py-1" onClick={markAllRead}>
                  <Check className="w-3 h-3 mr-1" />Mark all read
                </Button>
              )}
            </div>

            {/* List */}
            <div className="max-h-[400px] overflow-y-auto">
              {activities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Inbox className="w-8 h-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No notifications yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Upload leads or create a video to get started.
                  </p>
                </div>
              ) : (
                activities.map(a => {
                  const isUnread = new Date(a.timestamp).getTime() > new Date(lastReadAt).getTime();
                  return (
                    <div
                      key={a.id}
                      className={`flex items-start gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors ${isUnread ? 'bg-primary/5' : ''}`}
                    >
                      <div className="mt-0.5 shrink-0">{activityIcon(a.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-snug">{a.message}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(a.timestamp)}</p>
                      </div>
                      {isUnread && (
                        <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
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
                {user?.email}
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
