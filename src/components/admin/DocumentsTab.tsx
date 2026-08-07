"use client";
import { useState, Fragment } from "react";
import { admin as adminT } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import { FileDropzone } from "./FileDropzone";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, FileText, ChevronDown, ChevronUp, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

export interface Document {
  id: string;
  name: string;
  status: "queued" | "processing" | "success" | "failed";
  errorMessage?: string | null;
  summary?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

// What became of one file in a batch. `error` set means the file never reached
// the queue — it is the retryable half of an import.
export interface UploadOutcome {
  file: File;
  error?: string;
}

export interface IndexProgress {
  remaining: number;
  // The pass stopped on a provider rate limit and is sitting out a cooldown.
  waiting?: boolean;
}

interface DocumentsTabProps {
  documents: Document[];
  onUpload: (files: File[], onProgress: (done: number) => void) => Promise<UploadOutcome[]>;
  onIndex: (onProgress: (progress: IndexProgress) => void) => Promise<void>;
  onReindex: (documentId: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  lang?: Lang;
}

const STATUS_MAP = {
  queued: { variant: "secondary" as const },
  processing: { variant: "warning" as const },
  success: { variant: "success" as const },
  failed: { variant: "destructive" as const },
};

export function DocumentsTab({ documents, onUpload, onIndex, onReindex, onDelete, lang = "id" }: DocumentsTabProps) {
  const T = adminT[lang];
  const STATUS_LABELS = {
    queued: T.statusQueued,
    success: T.statusSuccess,
    processing: T.statusProcessing,
    failed: T.statusFailed,
  };
  const [isUploading, setIsUploading] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  // Files that never made it into the queue, kept as File objects so the retry
  // button can send the very same bytes without asking the admin to find them
  // in the file picker again.
  const [failedFiles, setFailedFiles] = useState<UploadOutcome[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reindexingId, setReindexingId] = useState<string | null>(null);
  const [expandedSummary, setExpandedSummary] = useState<string | null>(null);

  async function handleUpload(files: File[]) {
    setIsUploading(true);
    setFailedFiles([]);
    setProgressLabel(`${T.uploadProgress} 0 / ${files.length}`);
    try {
      const outcomes = await onUpload(files, (done) => {
        setProgressLabel(`${T.uploadProgress} ${done} / ${files.length}`);
      });

      const failed = outcomes.filter((o) => o.error);
      setFailedFiles(failed);
      const stored = outcomes.length - failed.length;

      if (stored > 0) {
        toast({ title: "Berhasil!", description: `${stored} ${T.uploadedCount} ${T.indexingContinues}` });
      }
      if (failed.length > 0) {
        toast({
          variant: "destructive",
          title: "Upload Gagal",
          // One reason in full; several would not fit, and each is listed under
          // the dropzone with its own file name anyway.
          description: failed.length === 1
            ? `"${failed[0].file.name}": ${failed[0].error}`
            : `${failed.length} dari ${outcomes.length} file gagal diupload.`,
        });
      }

      // Only worth driving the indexer if something actually reached the queue.
      if (stored > 0) await runIndexing();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat mengupload.";
      toast({ variant: "destructive", title: "Upload Gagal", description: msg });
    } finally {
      setProgressLabel(null);
      setIsUploading(false);
    }
  }

  async function runIndexing() {
    try {
      await onIndex(({ remaining, waiting }) => {
        setProgressLabel(
          waiting ? `${T.indexWaiting} · ${remaining}`
            : remaining > 0 ? `${T.indexProgress} · ${remaining}`
              : null
        );
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Pengindeksan gagal dijalankan.";
      toast({ variant: "destructive", title: "Indexing", description: msg });
    }
  }

  async function handleRetryFailedFiles() {
    const files = failedFiles.map((o) => o.file);
    if (files.length > 0) await handleUpload(files);
  }

  async function handleReindex(id: string) {
    setReindexingId(id);
    try {
      await onReindex(id);
      toast({ title: T.reindexStarted });
      await runIndexing();
    } catch (err) {
      const msg = err instanceof Error ? err.message : T.reindexFailed;
      toast({ variant: "destructive", title: T.reindexFailed, description: msg });
    } finally {
      setReindexingId(null);
    }
  }

  const queuedCount = documents.filter((d) => d.status === "queued").length;

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await onDelete(id);
      toast({ title: "Dokumen dihapus." });
    } catch {
      toast({ variant: "destructive", title: "Gagal menghapus dokumen." });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">{T.uploadTitle}</h2>
        <p className="text-sm text-gray-500 mb-4">{T.uploadDesc}</p>
        <FileDropzone onUpload={handleUpload} isUploading={isUploading} progressLabel={progressLabel} lang={lang} />
        {failedFiles.length > 0 && !isUploading && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
            <p className="text-sm font-medium text-red-700">
              {T.failedPanelTitle} ({failedFiles.length})
            </p>
            <ul className="space-y-1">
              {failedFiles.map(({ file, error }) => (
                <li key={file.name} className="text-xs text-red-700">
                  <span className="font-medium">{file.name}</span> — {error}
                </li>
              ))}
            </ul>
            <Button size="sm" variant="outline" onClick={handleRetryFailedFiles} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              {T.retryFailedBtn}
            </Button>
          </div>
        )}
        {queuedCount > 0 && !isUploading && (
          // The queue survives a closed tab, so an admin coming back to a
          // half-finished import needs a way to pick it up that does not involve
          // waiting for tonight's cron.
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border bg-gray-50 p-3">
            <p className="text-sm text-gray-600">
              {T.indexProgress} · {queuedCount}
            </p>
            <Button size="sm" variant="outline" onClick={() => runIndexing()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              {T.resumeIndexBtn}
            </Button>
          </div>
        )}
      </div>
      <div>
        <h2 className="text-lg font-semibold mb-3">{T.docList}</h2>
        {documents.length === 0 ? (
          <div className="text-center py-10 text-gray-400 border rounded-xl">
            <FileText className="h-8 w-8 mx-auto mb-2" />
            <p className="text-sm">{T.noDoc}</p>
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{T.colName}</TableHead>
                  <TableHead>{T.colStatus}</TableHead>
                  <TableHead>{T.colDate}</TableHead>
                  <TableHead className="w-16">{T.colAction}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => {
                  const s = { ...STATUS_MAP[doc.status], label: STATUS_LABELS[doc.status] };
                  const isExpanded = expandedSummary === doc.id;
                  return (
                    <Fragment key={doc.id}>
                      <TableRow>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                            <span>{doc.name}</span>
                            {doc.summary && (
                              <button
                                onClick={() => setExpandedSummary(isExpanded ? null : doc.id)}
                                className="ml-1 flex items-center gap-1 text-xs text-teal-500 hover:text-teal-700"
                              >
                                <Sparkles className="h-3 w-3" />
                                {T.aiSummary}
                                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={s.variant}>{s.label}</Badge>
                        </TableCell>
                        <TableCell className="text-gray-500 text-sm">
                          {new Date(doc.createdAt).toLocaleDateString("id-ID")}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-gray-400 hover:text-red-500"
                            onClick={() => handleDelete(doc.id)}
                            disabled={deletingId === doc.id}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {doc.status === "failed" && doc.errorMessage && (
                        <TableRow>
                          <TableCell colSpan={4} className="bg-red-50 border-t-0">
                            <div className="flex items-start gap-2 py-1">
                              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                              <div className="text-sm text-red-700">{doc.errorMessage}</div>
                              {/* Offered on every failed row, including the ones
                                  whose text was never stored: the server answers
                                  for which of those can be retried, and it is the
                                  only place that knows. */}
                              <Button
                                variant="outline"
                                size="sm"
                                className="ml-auto shrink-0 gap-1.5"
                                onClick={() => handleReindex(doc.id)}
                                disabled={reindexingId === doc.id}
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                                {T.reindexBtn}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      {isExpanded && doc.summary && (
                        <TableRow>
                          <TableCell colSpan={4} className="bg-teal-50 border-t-0">
                            <div className="flex items-start gap-2 py-1">
                              <Sparkles className="h-4 w-4 text-teal-500 mt-0.5 shrink-0" />
                              <div className="text-sm text-gray-700 whitespace-pre-line">{doc.summary}</div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
