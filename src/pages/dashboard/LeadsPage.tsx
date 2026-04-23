import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Lead } from '@/types/data';
import { getLeads, saveLeads, updateLead, deleteLead, addActivity, getApiKey, saveApiKey } from '@/services/dataService';
import { verifyEmailsInBatches } from '@/services/emailVerificationService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Upload,
  Search,
  MailCheck,
  Loader2,
  FileUp,
  CheckCircle2,
  XCircle,
  Clock,
  Key,
  Download,
  FileText,
  Eye,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

interface CsvBatch {
  id: string;
  fileName: string;
  uploadedAt: string;
  leads: Lead[];
}

export default function LeadsPage() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  // Batch view dialog
  const [viewBatch, setViewBatch] = useState<CsvBatch | null>(null);
  const [batchSearch, setBatchSearch] = useState('');

  // Delete confirmation dialog
  const [deletingBatch, setDeletingBatch] = useState<CsvBatch | null>(null);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);

  // API key dialog state
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);

  const loadLeads = useCallback(async () => {
    if (user) {
      const data = await getLeads(user.id);
      setLeads(data);
    }
  }, [user]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  // ── Group leads into CSV batches ──────────────────────────────────────────────

  const batches = useMemo<CsvBatch[]>(() => {
    const map = new Map<string, CsvBatch>();
    // Leads without a batchId get grouped under a legacy batch
    for (const lead of leads) {
      const batchId = lead.csvBatchId ?? '__legacy__';
      const fileName = lead.csvFileName ?? 'Imported Leads';
      const uploadedAt = lead.createdAt;
      if (!map.has(batchId)) {
        map.set(batchId, { id: batchId, fileName, uploadedAt, leads: [] });
      }
      map.get(batchId)!.leads.push(lead);
    }
    // Sort batches newest first
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
    );
  }, [leads]);

  // ── Sample CSV download ───────────────────────────────────────────────────────

  const downloadSampleCSV = () => {
    const rows = [
      ['First Name', 'Last Name', 'Email', 'Company Website', 'Company', 'Company Description'],
      ['Jane', 'Smith', 'jane@acmecorp.com', 'https://acmecorp.com', 'Acme Corp', 'Acme Corp builds B2B SaaS tools for HR teams to automate employee onboarding.'],
      ['John', 'Doe', 'john@brightai.io', 'https://brightai.io', 'BrightAI', 'BrightAI helps e-commerce brands predict churn using machine learning.'],
    ];
    const csv = rows.map(r => r.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_leads.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── CSV parsing ──────────────────────────────────────────────────────────────

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const parseCSV = (text: string, batchId: string, fileName: string): Lead[] => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const colMap: Record<string, string> = {
      'first name': 'firstName',
      'last name': 'lastName',
      'email': 'email',
      'company website': 'website',
      'company': 'company',
      'company description': 'companyDescription',
    };
    const required = Object.keys(colMap);
    const missing = required.filter(r => !headers.includes(r));
    if (missing.length > 0) {
      toast.error(`Missing columns: ${missing.join(', ')}`);
      return [];
    }

    const idx = (col: string) => headers.indexOf(col);
    return lines.slice(1)
      .map(line => {
        const v = line.match(/(".*?"|[^,]+)(?=,|$)/g)?.map(c => c.trim().replace(/^"|"$/g, '')) ?? line.split(',').map(c => c.trim());
        return {
          id: crypto.randomUUID(),
          userId: user!.id,
          firstName: v[idx('first name')] || '',
          lastName: v[idx('last name')] || '',
          email: v[idx('email')] || '',
          website: v[idx('company website')] || '',
          company: v[idx('company')] || '',
          companyDescription: v[idx('company description')] || '',
          status: 'uploaded' as const,
          createdAt: new Date().toISOString(),
          csvBatchId: batchId,
          csvFileName: fileName,
        };
      })
      .filter(lead => lead.email);
  };

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file');
      return;
    }
    setIsUploading(true);
    try {
      const batchId = crypto.randomUUID();
      const text = await file.text();
      const newLeads = parseCSV(text, batchId, file.name);
      if (newLeads.length > 0) {
        await saveLeads(newLeads);
        addActivity({
          id: crypto.randomUUID(),
          type: 'lead_uploaded',
          message: `Uploaded "${file.name}" — ${newLeads.length} leads`,
          timestamp: new Date().toISOString(),
          userId: user!.id,
        });
        toast.success(`"${file.name}" uploaded — ${newLeads.length} leads`);
        await loadLeads();
      }
    } catch {
      toast.error('Failed to upload leads');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFile(e.target.files[0]);
    // Reset so same file can be re-uploaded
    e.target.value = '';
  };

  // ── Batch delete ──────────────────────────────────────────────────────────────

  const handleDeleteBatch = async () => {
    if (!deletingBatch) return;
    setIsDeletingBatch(true);
    try {
      await Promise.all(deletingBatch.leads.map(l => deleteLead(l.id)));
      toast.success(`"${deletingBatch.fileName}" deleted`);
      setDeletingBatch(null);
      if (viewBatch?.id === deletingBatch.id) setViewBatch(null);
      await loadLeads();
    } catch {
      toast.error('Failed to delete CSV batch');
    } finally {
      setIsDeletingBatch(false);
    }
  };

  // ── Email verification ───────────────────────────────────────────────────────

  const handleVerifyEmails = async () => {
    const toVerify = leads.filter(l => l.status === 'uploaded');
    if (toVerify.length === 0) {
      toast.error('No unverified leads to process');
      return;
    }

    const apiKey = await getApiKey(user!.id, 'mailtester_ninja');
    if (!apiKey) {
      setShowKeyDialog(true);
      return;
    }

    startVerification(toVerify, apiKey);
  };

  const startVerification = (toVerify: Lead[], apiKey: string) => {
    setIsVerifying(true);
    setProgress({ current: 0, total: toVerify.length });

    setLeads(prev =>
      prev.map(l => toVerify.find(tv => tv.id === l.id) ? { ...l, status: 'verifying' } : l),
    );

    let validCount = 0;
    let invalidCount = 0;

    verifyEmailsInBatches(
      toVerify.map(l => l.email),
      apiKey,
      async (email, result, error) => {
        const lead = toVerify.find(l => l.email === email)!;
        const status: Lead['status'] = result?.isValid ? 'valid' : 'invalid';
        const updates: Partial<Lead> = {
          status,
          verificationCode: result?.code,
          verificationMessage: error ? 'Error' : result?.message,
          mxServer: result?.mx,
          verifiedAt: new Date().toISOString(),
        };

        await updateLead(lead.id, updates);
        setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, ...updates } : l));
        setProgress(prev => prev ? { ...prev, current: prev.current + 1 } : null);

        if (status === 'valid') validCount++;
        else invalidCount++;
      },
    ).then(() => {
      addActivity({
        id: crypto.randomUUID(),
        type: 'lead_verified',
        message: `Verified ${toVerify.length} emails — ${validCount} valid, ${invalidCount} invalid`,
        timestamp: new Date().toISOString(),
        userId: user!.id,
      });
      toast.success(`Done: ${validCount} valid, ${invalidCount} invalid`);
      setIsVerifying(false);
      setProgress(null);
    });
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    setIsSavingKey(true);
    try {
      await saveApiKey(user!.id, 'mailtester_ninja', apiKeyInput.trim());
      setShowKeyDialog(false);
      setApiKeyInput('');
      toast.success('API key saved');
      const toVerify = leads.filter(l => l.status === 'uploaded');
      startVerification(toVerify, apiKeyInput.trim());
    } catch {
      toast.error('Failed to save API key');
    } finally {
      setIsSavingKey(false);
    }
  };

  // ── Derived state ─────────────────────────────────────────────────────────────

  const counts = {
    uploaded: leads.filter(l => l.status === 'uploaded').length,
    valid: leads.filter(l => l.status === 'valid').length,
    invalid: leads.filter(l => l.status === 'invalid').length,
  };

  const filteredBatchLeads = useMemo(() => {
    if (!viewBatch) return [];
    const q = batchSearch.toLowerCase();
    if (!q) return viewBatch.leads;
    return viewBatch.leads.filter(l =>
      `${l.firstName} ${l.lastName}`.toLowerCase().includes(q) ||
      l.email.toLowerCase().includes(q) ||
      l.company.toLowerCase().includes(q),
    );
  }, [viewBatch, batchSearch]);

  // ── Status badge ──────────────────────────────────────────────────────────────

  const statusBadge = (lead: Lead) => {
    switch (lead.status) {
      case 'uploaded':
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> Pending
          </Badge>
        );
      case 'verifying':
        return (
          <Badge variant="outline" className="flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Verifying
          </Badge>
        );
      case 'valid':
        return (
          <Badge className="flex items-center gap-1 bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30">
            <CheckCircle2 className="w-3 h-3" /> Valid
          </Badge>
        );
      case 'invalid':
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <XCircle className="w-3 h-3" /> Invalid
          </Badge>
        );
    }
  };

  const batchStatusSummary = (batch: CsvBatch) => {
    const v = batch.leads.filter(l => l.status === 'valid').length;
    const inv = batch.leads.filter(l => l.status === 'invalid').length;
    const pend = batch.leads.filter(l => l.status === 'uploaded' || l.status === 'verifying').length;
    return { v, inv, pend };
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Leads</h1>
          <p className="text-muted-foreground mt-1">Upload CSVs and verify prospect emails</p>
        </div>
        <div className="flex items-center gap-2">
          {progress && (
            <span className="text-sm text-muted-foreground">
              Verifying {progress.current}/{progress.total}…
            </span>
          )}
          <Button
            onClick={handleVerifyEmails}
            disabled={isVerifying || counts.uploaded === 0}
          >
            {isVerifying ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <MailCheck className="w-4 h-4 mr-2" />
            )}
            Verify Emails {counts.uploaded > 0 && `(${counts.uploaded})`}
          </Button>
        </div>
      </div>

      {/* Summary chips */}
      {leads.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <Badge variant="secondary">{leads.length} total</Badge>
          {counts.valid > 0 && (
            <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30">
              {counts.valid} valid
            </Badge>
          )}
          {counts.invalid > 0 && (
            <Badge variant="destructive">{counts.invalid} invalid</Badge>
          )}
          {counts.uploaded > 0 && (
            <Badge variant="outline">{counts.uploaded} pending</Badge>
          )}
        </div>
      )}

      {/* Upload Area */}
      <Card>
        <CardContent className="pt-6">
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`
              border-2 border-dashed rounded-xl p-8 text-center transition-all
              ${dragActive ? 'border-primary bg-primary/5' : 'border-border'}
              ${isUploading ? 'opacity-50 pointer-events-none' : ''}
            `}
          >
            {isUploading ? (
              <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
            ) : (
              <FileUp className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            )}
            <h3 className="text-lg font-semibold mb-2">
              {isUploading ? 'Uploading…' : 'Upload CSV File'}
            </h3>
            <p className="text-muted-foreground mb-4">
              Required columns: <strong>First Name, Last Name, Email, Company Website, Company, Company Description</strong>
            </p>
            <div className="flex items-center justify-center gap-3">
              <input type="file" accept=".csv" onChange={handleFileInput} className="hidden" id="csv-upload" />
              <label htmlFor="csv-upload">
                <Button asChild disabled={isUploading}>
                  <span><Upload className="w-4 h-4 mr-2" />Select File</span>
                </Button>
              </label>
              <Button variant="outline" onClick={downloadSampleCSV} type="button">
                <Download className="w-4 h-4 mr-2" />Sample CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CSV Batches List */}
      <Card>
        <CardHeader>
          <CardTitle>Uploaded CSVs ({batches.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No CSVs uploaded yet. Upload a file to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {batches.map(batch => {
                const { v, inv, pend } = batchStatusSummary(batch);
                return (
                  <div
                    key={batch.id}
                    className="flex items-center gap-4 px-4 py-3 rounded-lg border border-border hover:bg-muted/40 transition-colors"
                  >
                    {/* File icon */}
                    <FileText className="w-5 h-5 text-muted-foreground shrink-0" />

                    {/* File name + date */}
                    <div className="flex-1 min-w-0">
                      <button
                        className="text-sm font-medium text-left hover:text-primary transition-colors truncate block max-w-xs"
                        onClick={() => { setViewBatch(batch); setBatchSearch(''); }}
                      >
                        {batch.fileName}
                      </button>
                      <span className="text-xs text-muted-foreground">{formatDate(batch.uploadedAt)}</span>
                    </div>

                    {/* Lead count */}
                    <Badge variant="secondary" className="shrink-0">
                      {batch.leads.length} leads
                    </Badge>

                    {/* Verification summary */}
                    <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                      {v > 0 && (
                        <Badge className="text-xs bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30">
                          {v} valid
                        </Badge>
                      )}
                      {inv > 0 && (
                        <Badge variant="destructive" className="text-xs">{inv} invalid</Badge>
                      )}
                      {pend > 0 && (
                        <Badge variant="outline" className="text-xs">{pend} pending</Badge>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setViewBatch(batch); setBatchSearch(''); }}
                      >
                        <Eye className="w-4 h-4 mr-1" /> View
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeletingBatch(batch)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Batch Dialog */}
      <Dialog open={!!viewBatch} onOpenChange={open => !open && setViewBatch(null)}>
        <DialogContent className="max-w-5xl w-full max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {viewBatch?.fileName}
            </DialogTitle>
            <DialogDescription>
              {viewBatch?.leads.length} leads · Uploaded {viewBatch ? formatDate(viewBatch.uploadedAt) : ''}
            </DialogDescription>
          </DialogHeader>

          {/* Search inside dialog */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search leads…"
              value={batchSearch}
              onChange={e => setBatchSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="overflow-auto flex-1 rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBatchLeads.length > 0 ? (
                  filteredBatchLeads.map(lead => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {lead.firstName} {lead.lastName}
                      </TableCell>
                      <TableCell className="text-sm">{lead.email}</TableCell>
                      <TableCell className="text-sm">{lead.company}</TableCell>
                      <TableCell className="max-w-[140px] truncate text-sm text-muted-foreground">
                        {lead.website || '—'}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                        {lead.companyDescription || '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {lead.verificationMessage ?? '—'}
                      </TableCell>
                      <TableCell>{statusBadge(lead)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No leads match your search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewBatch(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingBatch} onOpenChange={open => !open && setDeletingBatch(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete CSV Batch</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>"{deletingBatch?.fileName}"</strong>?
              This will permanently remove all {deletingBatch?.leads.length} leads in this file.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingBatch(null)} disabled={isDeletingBatch}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteBatch} disabled={isDeletingBatch}>
              {isDeletingBatch ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* API Key Dialog */}
      <Dialog open={showKeyDialog} onOpenChange={setShowKeyDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" /> MailTester.Ninja API Key
            </DialogTitle>
            <DialogDescription>
              Enter your MailTester.Ninja subscription key. It will be saved securely and reused for future verifications.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Your subscription key"
            value={apiKeyInput}
            onChange={e => setApiKeyInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSaveApiKey()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowKeyDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveApiKey} disabled={isSavingKey || !apiKeyInput.trim()}>
              {isSavingKey ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save & Verify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
