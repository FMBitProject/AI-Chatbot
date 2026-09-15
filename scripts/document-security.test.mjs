// Exercises the installed XML parsers and real document extraction without DB or network.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { extractText, DocumentError } from "../src/lib/document-extraction.ts";

const require = createRequire(import.meta.url);
const mammothRequire = createRequire(require.resolve("mammoth"));
const officeRequire = createRequire(require.resolve("officeparser"));
const JSZip = mammothRequire("jszip");
const ExcelJS = require("exceljs");
globalThis.fetch = async () => { throw new Error("Network forbidden in document tests"); };

// Bound a regression in CPU behavior by killing the isolated child, not by
// trying to interrupt the same event loop that a malicious XML could block.
for (const loader of [mammothRequire, officeRequire]) {
  const result = spawnSync(process.execPath, ["--input-type=commonjs", "-e", `
    const { DOMParser } = require(${JSON.stringify(loader.resolve("@xmldom/xmldom"))});
    console.error = () => {};
    console.warn = () => {};
    try { new DOMParser().parseFromString('<root>' + '<'.repeat(50_000) + '></root>', 'text/xml'); }
    catch { /* Rejecting malformed XML is expected. */ }
  `], {timeout: 10_000, encoding: "utf8", maxBuffer: 1024 * 1024});
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
}

async function docx(text, entries = 0) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  for (let i = 0; i < entries; i++) zip.file(`extra-${i}.txt`, "x");
  return zip.generateAsync({type: "nodebuffer", compression: "DEFLATE"});
}
assert((await extractText(await docx("Kebijakan cuti — café &amp; izin"), "test.docx")).includes("Kebijakan cuti — café & izin"));
assert.equal((await extractText(await docx("A".repeat(2_000_000)), "boundary.docx")).length, 2_000_000);
await assert.rejects(extractText(await docx("A".repeat(2_000_001)), "text-limit.docx"), DocumentError);
await assert.rejects(extractText(await docx("A".repeat(17 * 1024 * 1024)), "zip-limit.docx"), DocumentError);
await assert.rejects(extractText(await docx("Small", 1999), "entry-limit.docx"), DocumentError);
const workbook = new ExcelJS.Workbook();
workbook.addWorksheet("HR").addRow(["Annual leave", 12]);
const xlsx = await extractText(Buffer.from(await workbook.xlsx.writeBuffer()), "test.xlsx");
assert(xlsx.includes("Annual leave") && xlsx.includes("12"));
const pptx = new JSZip();
pptx.file("ppt/presentation.xml", '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>');
pptx.file("ppt/_rels/presentation.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>');
pptx.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>');
pptx.file("ppt/slides/slide1.xml", '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Security training</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>');
assert((await extractText(await pptx.generateAsync({type: "nodebuffer"}), "test.pptx")).includes("Security training"));
console.log("PASS: malformed XML terminates within budget on both patched parsers; DOCX/XLSX/PPTX extraction and DOCX size limits work.");
