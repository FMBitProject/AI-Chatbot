"use client";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

interface FileDropzoneProps {
  onUpload: (files: File[]) => void;
  isUploading: boolean;
}

export function FileDropzone({ onUpload, isUploading }: FileDropzoneProps) {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: { file: File; errors: readonly { message: string }[] }[]) => {
      if (rejectedFiles.length > 0) {
        rejectedFiles.forEach(({ file, errors }) => {
          const isTooLarge = errors.some((e) => e.message.includes("large") || e.message.includes("size"));
          if (isTooLarge || file.size > MAX_FILE_SIZE) {
            toast({
              variant: "destructive",
              title: "File terlalu besar",
              description: `"${file.name}" melebihi batas 10 MB. Upload dibatalkan.`,
            });
          } else {
            toast({
              variant: "destructive",
              title: "Format tidak didukung",
              description: `"${file.name}" bukan file PDF atau DOCX.`,
            });
          }
        });
      }
      const validFiles = acceptedFiles.filter((f) => {
        if (f.size > MAX_FILE_SIZE) {
          toast({
            variant: "destructive",
            title: "File terlalu besar",
            description: `"${f.name}" melebihi batas maksimum 10 MB. Upload dibatalkan.`,
          });
          return false;
        }
        return true;
      });
      if (validFiles.length > 0) {
        setPendingFiles(validFiles);
      }
    },
    []
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    maxSize: MAX_FILE_SIZE,
    disabled: isUploading,
  });

  function handleUpload() {
    if (pendingFiles.length === 0) return;
    onUpload(pendingFiles);
    setPendingFiles([]);
  }

  function removeFile(name: string) {
    setPendingFiles((prev) => prev.filter((f) => f.name !== name));
  }

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
          isDragActive ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-blue-300 hover:bg-gray-50",
          isUploading && "opacity-50 cursor-not-allowed"
        )}
      >
        <input {...getInputProps()} />
        <UploadCloud className={cn("mx-auto h-10 w-10 mb-3", isDragActive ? "text-blue-500" : "text-gray-300")} />
        <p className="text-sm font-medium text-gray-600">
          {isDragActive ? "Lepaskan file di sini..." : "Seret & lepas file ke sini, atau klik untuk memilih"}
        </p>
        <p className="text-xs text-gray-400 mt-1">PDF, DOCX · Maks. 10 MB per file</p>
      </div>
      {pendingFiles.length > 0 && (
        <div className="space-y-2">
          {pendingFiles.map((f) => (
            <div key={f.name} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
              <span className="truncate text-gray-700">{f.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-400">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                <button onClick={() => removeFile(f.name)} className="text-gray-400 hover:text-red-500">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={handleUpload}
            disabled={isUploading}
            className="w-full bg-blue-600 text-white text-sm rounded-lg py-2 font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isUploading ? "Mengupload..." : `Upload ${pendingFiles.length} File`}
          </button>
        </div>
      )}
    </div>
  );
}
