import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BookOpen } from "lucide-react";

interface Citation {
  id: string;
  text: string;
  documentName?: string;
}

interface CitationsAccordionProps {
  citations: Citation[];
}

export function CitationsAccordion({ citations }: CitationsAccordionProps) {
  if (!citations.length) return null;
  return (
    <div className="mt-3 border-t border-gray-100 pt-2">
      <Accordion type="single" collapsible>
        <AccordionItem value="citations" className="border-0">
          <AccordionTrigger className="py-2 text-xs text-gray-500 hover:text-gray-700 hover:no-underline">
            <span className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              {citations.length} sumber dokumen ditemukan
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2 mt-1">
              {citations.map((c, i) => (
                <div key={c.id} className="rounded-lg bg-blue-50 border border-blue-100 p-3">
                  <p className="text-xs font-semibold text-blue-700 mb-1">
                    [{i + 1}] {c.documentName ?? "Dokumen Internal"}
                  </p>
                  <p className="text-xs text-gray-600 leading-relaxed">{c.text}</p>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
