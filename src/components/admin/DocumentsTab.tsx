"use client";
import { useState, Fragment } from "react";
import { admin as adminT } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import { FileDropzone } from "./FileDropzone";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, FileText, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

export interface Document {
  id: string;
  name: string;
  status: "processing" | "success" | "failed";
  summary?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

interface DocumentsTabProps {
  documents: Document[];
  onUpload: (files: File[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  lang?: Lang;
}

const STATUS_MAP = {
  processing: { label: "Processing", variant: "warning" as const },
  success: { label: "Sukses", variant: "success" as const },
  failed: { label: "Gagal", variant: "destructive" as const },
};

export function DocumentsTab({ documents, onUpload, onDelete, lang = "id" }: DocumentsTabProps) {
  const T = adminT[lang];
  const STATUS_LABELS = { success: T.statusSuccess, processing: T.statusProcessing, failed: T.statusFailed };
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedSummary, setExpandedSummary] = useState<string | null>(null);

  async function handleUpload(files: File[]) {
    setIsUploading(true);
    try {
      await onUpload(files);
      toast({ title: "Berhasil!", description: `${files.length} dokumen sedang diproses.` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat mengupload.";
      toast({ variant: "destructive", title: "Upload Gagal", description: msg });
    } finally {
      setIsUploading(false);
    }
  }

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
        <FileDropzone onUpload={handleUpload} isUploading={isUploading} lang={lang} />
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
                                className="ml-1 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700"
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
                      {isExpanded && doc.summary && (
                        <TableRow>
                          <TableCell colSpan={4} className="bg-blue-50 border-t-0">
                            <div className="flex items-start gap-2 py-1">
                              <Sparkles className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
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
