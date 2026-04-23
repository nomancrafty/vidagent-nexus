import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getApiKey, saveApiKey } from '@/services/dataService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, CheckCircle2, Key, Bot, Sliders } from 'lucide-react';
import { toast } from 'sonner';

interface KeyField {
  service: string;
  label: string;
  placeholder: string;
  type?: 'text' | 'password';
  hint?: string;
  selectOptions?: { value: string; label: string }[];
}

const API_KEY_FIELDS: KeyField[] = [
  {
    service: 'gemini',
    label: 'Gemini API Key',
    placeholder: 'AIza…',
    type: 'password',
    hint: 'Google AI Studio → Get API Key (aistudio.google.com)',
  },
  {
    service: 'heygen',
    label: 'HeyGen API Key',
    placeholder: 'Your HeyGen API key',
    type: 'password',
    hint: 'HeyGen Dashboard → Settings → API',
  },
];

const AVATAR_FIELDS: KeyField[] = [
  {
    service: 'heygen_avatar_id',
    label: 'Avatar ID',
    placeholder: 'Hada_Suit_Sitting_Front_public',
    hint: 'HeyGen Avatar Library → click an avatar → copy its ID',
  },
  {
    service: 'heygen_avatar_style',
    label: 'Avatar Style',
    placeholder: 'circle',
    hint: 'How the avatar appears in the frame',
    selectOptions: [
      { value: 'circle', label: 'Circle (floating bubble)' },
      { value: 'closeup', label: 'Close-up' },
      { value: 'normal', label: 'Normal (full torso)' },
    ],
  },
  {
    service: 'heygen_background_asset_id',
    label: 'Background Video Asset ID',
    placeholder: '5d10bc364e1846fcab6e79cf9f526f5d',
    hint: 'Optional — HeyGen asset ID for background video. Leave blank for no background.',
  },
];

const VOICE_FIELDS: KeyField[] = [
  {
    service: 'heygen_voice_id',
    label: 'Voice ID',
    placeholder: 'e7f265ef0dc7426e8ed217c58da7e371',
    hint: 'HeyGen Voice Library → copy the voice ID',
  },
  {
    service: 'heygen_voice_emotion',
    label: 'Voice Emotion',
    placeholder: 'Excited',
    hint: 'Tone of the generated speech',
    selectOptions: [
      { value: 'Excited', label: 'Excited' },
      { value: 'Friendly', label: 'Friendly' },
      { value: 'Serious', label: 'Serious' },
      { value: 'Soothing', label: 'Soothing' },
      { value: 'Broadcaster', label: 'Broadcaster' },
    ],
  },
  {
    service: 'heygen_voice_speed',
    label: 'Voice Speed',
    placeholder: '1',
    hint: '0.5 (slow) → 1 (normal) → 1.5 (fast)',
  },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const allFields = [...API_KEY_FIELDS, ...AVATAR_FIELDS, ...VOICE_FIELDS];

  const loadKeys = useCallback(async () => {
    if (!user) return;
    const results = await Promise.all(
      allFields.map(f => getApiKey(user.id, f.service).then(v => ({ service: f.service, value: v }))),
    );
    const vals: Record<string, string> = {};
    const savedMap: Record<string, boolean> = {};
    for (const { service, value } of results) {
      vals[service] = value ?? '';
      savedMap[service] = !!value;
    }
    setValues(vals);
    setSaved(savedMap);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const handleSave = async (service: string) => {
    const val = values[service]?.trim();
    if (!val) { toast.error('Field cannot be empty'); return; }
    setSaving(prev => ({ ...prev, [service]: true }));
    try {
      await saveApiKey(user!.id, service, val);
      setSaved(prev => ({ ...prev, [service]: true }));
      toast.success('Saved');
    } catch {
      toast.error('Failed to save — try again');
    } finally {
      setSaving(prev => ({ ...prev, [service]: false }));
    }
  };

  const setValue = (service: string, val: string) => {
    setValues(prev => ({ ...prev, [service]: val }));
    setSaved(prev => ({ ...prev, [service]: false }));
  };

  const renderField = (field: KeyField) => {
    const isSaved = saved[field.service];
    const isSaving = saving[field.service];
    const currentVal = values[field.service] ?? '';

    return (
      <div key={field.service} className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">{field.label}</label>
          {isSaved && (
            <Badge className="text-xs bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Saved
            </Badge>
          )}
        </div>
        {field.hint && (
          <p className="text-xs text-muted-foreground">{field.hint}</p>
        )}
        <div className="flex gap-2">
          {field.selectOptions ? (
            <Select value={currentVal} onValueChange={val => setValue(field.service, val)}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {field.selectOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              type={field.type ?? 'text'}
              placeholder={field.placeholder}
              value={currentVal}
              onChange={e => setValue(field.service, e.target.value)}
              className="flex-1 font-mono text-sm"
            />
          )}
          <Button
            onClick={() => handleSave(field.service)}
            disabled={isSaving || !currentVal.trim()}
            size="sm"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure API keys and HeyGen video defaults</p>
      </div>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            API Keys
          </CardTitle>
          <CardDescription>
            Stored securely per account. Used automatically during video creation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {API_KEY_FIELDS.map(renderField)}
        </CardContent>
      </Card>

      {/* Avatar Config */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            Avatar Settings
          </CardTitle>
          <CardDescription>
            Controls which avatar appears and how it's positioned in the video.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {AVATAR_FIELDS.map(renderField)}
        </CardContent>
      </Card>

      {/* Voice Config */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-primary" />
            Voice Settings
          </CardTitle>
          <CardDescription>
            Controls the voice, emotion, and speed of the avatar speech.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {VOICE_FIELDS.map(renderField)}
        </CardContent>
      </Card>
    </div>
  );
}
