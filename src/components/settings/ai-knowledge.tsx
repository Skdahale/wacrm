'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  BookOpen,
  Upload,
  FileText,
  FileSpreadsheet,
  X,
  FileUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { useTranslations } from 'next-intl';

interface DocSummary {
  id: string;
  title: string;
  updated_at: string;
}

/** Editor target: 'new' when creating, a doc id when editing, null when closed. */
type EditTarget = 'new' | string | null;

export function AiKnowledgeCard({
  accountId,
  canEdit,
  hasEmbeddingsKey,
}: {
  accountId: string | null;
  canEdit: boolean;
  hasEmbeddingsKey: boolean;
}) {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditTarget>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [reindexing, setReindexing] = useState(false);

  // Upload state
  const [showUpload, setShowUpload] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileCustomTitle, setFileCustomTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadedAccountIdRef = useRef<string | null>(null);
  const t = useTranslations('Settings.aiKnowledge');

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/knowledge');
      const data = await res.json();
      if (res.ok) setDocs(data.documents ?? []);
      else toast.error(data.error ?? t('loadFailed'));
    } catch {
      toast.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!accountId || loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    void fetchDocs();
  }, [accountId, fetchDocs]);

  const openNew = () => {
    setShowUpload(false);
    setEditing('new');
    setTitle('');
    setContent('');
  };

  const openEdit = async (id: string) => {
    setShowUpload(false);
    try {
      const res = await fetch(`/api/ai/knowledge/${id}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? t('openFailed'));
        return;
      }
      setEditing(id);
      setTitle(data.title ?? '');
      setContent(data.content ?? '');
    } catch {
      toast.error(t('openFailed'));
    }
  };

  const cancelEdit = () => {
    setEditing(null);
    setTitle('');
    setContent('');
  };

  const save = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error(t('titleContentRequired'));
      return;
    }
    setSaving(true);
    try {
      const isNew = editing === 'new';
      const res = await fetch(
        isNew ? '/api/ai/knowledge' : `/api/ai/knowledge/${editing}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim(), content: content.trim() }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        if (data.warning) toast.warning(data.warning);
        else toast.success(isNew ? t('saveSuccessNew') : t('saveSuccessUpdate'));
        cancelEdit();
        await fetchDocs();
      } else {
        toast.error(data.error ?? t('saveFailed'));
      }
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/ai/knowledge/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(t('removeSuccess'));
        setDocs((d) => d.filter((x) => x.id !== id));
      } else {
        const data = await res.json();
        toast.error(data.error ?? t('removeFailed'));
      }
    } catch {
      toast.error(t('removeFailed'));
    }
  };

  const reindex = async () => {
    setReindexing(true);
    try {
      const res = await fetch('/api/ai/knowledge/reindex', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(t('reindexSuccess', { count: data.reindexed }));
      } else {
        toast.error(data.error ?? t('reindexFailed'));
      }
    } catch {
      toast.error(t('reindexFailed'));
    } finally {
      setReindexing(false);
    }
  };

  const handleFilePicked = (file: File) => {
    setSelectedFile(file);
    const suggestedTitle = file.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim();
    setFileCustomTitle(suggestedTitle || file.name);
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile) {
      toast.error('Please choose a document to upload.');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (fileCustomTitle.trim()) {
        formData.append('title', fileCustomTitle.trim());
      }

      const res = await fetch('/api/ai/knowledge/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(
          `"${data.title}" successfully uploaded and indexed (${data.charCount.toLocaleString()} characters)!`,
        );
        if (data.warning) toast.warning(data.warning);
        setSelectedFile(null);
        setFileCustomTitle('');
        setShowUpload(false);
        await fetchDocs();
      } else {
        toast.error(data.error ?? 'Failed to upload document.');
      }
    } catch {
      toast.error('Upload failed due to a network error.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4 text-primary" /> {t('title')}
        </CardTitle>
        <CardDescription>
          {t('description', {
            searchType: hasEmbeddingsKey ? t('semanticSearchOn') : t('keywordSearchOn'),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center py-4 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('loading')}
          </div>
        ) : (
          <>
            {docs.length === 0 && editing === null && !showUpload && (
              <p className="text-sm text-muted-foreground">
                {t('noDocs')}
              </p>
            )}

            {docs.length > 0 && (
              <ul className="divide-y divide-border rounded-md border border-border">
                {docs.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between gap-2 px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-primary/70" />
                      <span className="truncate text-sm font-medium text-foreground">
                        {doc.title}
                      </span>
                    </div>
                    {canEdit && (
                      <span className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => void openEdit(doc.id)}
                          title={t('editDoc')}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => void remove(doc.id)}
                          title={t('deleteDoc')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* Document Upload UI */}
            {showUpload && (
              <div className="space-y-4 rounded-lg border border-primary/30 bg-card/60 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileUp className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">
                      Upload Knowledge Document
                    </h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground"
                    onClick={() => {
                      setShowUpload(false);
                      setSelectedFile(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Upload PDFs, Word documents, Excel spreadsheets, CSVs, or text files. The AI bot extracts text, builds searchable index chunks, and uses them to answer customer questions accurately.
                </p>

                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[11px] font-medium">
                    PDF (.pdf)
                  </Badge>
                  <Badge variant="outline" className="text-[11px] font-medium">
                    Word (.docx, .doc)
                  </Badge>
                  <Badge variant="outline" className="text-[11px] font-medium">
                    Excel (.xlsx, .xls)
                  </Badge>
                  <Badge variant="outline" className="text-[11px] font-medium">
                    CSV (.csv)
                  </Badge>
                  <Badge variant="outline" className="text-[11px] font-medium">
                    Text (.txt, .md)
                  </Badge>
                </div>

                {/* Dropzone */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.md"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFilePicked(f);
                  }}
                />

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleFilePicked(f);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                    dragActive
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50 hover:bg-muted/30'
                  }`}
                >
                  <Upload className="mb-2 h-7 w-7 text-primary" />
                  <p className="text-sm font-medium text-foreground">
                    {selectedFile
                      ? selectedFile.name
                      : 'Click to browse or drag and drop your file here'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedFile
                      ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                      : 'Supports PDF, Word, Excel, CSV up to 20MB'}
                  </p>
                </div>

                {selectedFile && (
                  <div className="space-y-2">
                    <Label htmlFor="upload-title">Document Title</Label>
                    <Input
                      id="upload-title"
                      value={fileCustomTitle}
                      onChange={(e) => setFileCustomTitle(e.target.value)}
                      placeholder="e.g. MPSC Fee Structure & Syllabus"
                      disabled={uploading}
                    />
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowUpload(false);
                      setSelectedFile(null);
                    }}
                    disabled={uploading}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleUploadSubmit}
                    disabled={!selectedFile || uploading}
                  >
                    {uploading && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Upload & Index
                  </Button>
                </div>
              </div>
            )}

            {/* Manual text editor */}
            {editing !== null ? (
              <div className="space-y-3 rounded-md border border-border p-3">
                <div className="space-y-2">
                  <Label htmlFor="kb-title">{t('editDocTitle')}</Label>
                  <Input
                    id="kb-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('editDocTitlePlaceholder')}
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kb-content">{t('editDocContent')}</Label>
                  <Textarea
                    id="kb-content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={t('editDocContentPlaceholder')}
                    rows={8}
                    disabled={saving}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={cancelEdit} disabled={saving}>
                    {t('cancel')}
                  </Button>
                  <Button onClick={save} disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('saveDoc')}
                  </Button>
                </div>
              </div>
            ) : (
              canEdit &&
              !showUpload && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => {
                        cancelEdit();
                        setShowUpload(true);
                      }}
                    >
                      <Upload className="mr-1.5 h-4 w-4" /> Upload File (PDF / Excel / Word)
                    </Button>
                    <Button variant="outline" size="sm" onClick={openNew}>
                      <Plus className="mr-1.5 h-4 w-4" /> Add Text Document
                    </Button>
                  </div>
                  {hasEmbeddingsKey && docs.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={reindex}
                      disabled={reindexing}
                      title={t('reindexTooltip')}
                    >
                      {reindexing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      {t('reindex')}
                    </Button>
                  )}
                </div>
              )
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
