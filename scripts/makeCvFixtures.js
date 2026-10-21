/**
 * Rebuilds tests/fixtures/cv/sample.docx (JSZip + mammoth).
 * Run: node scripts/makeCvFixtures.js
 */
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import mammoth from "mammoth";

const root = path.resolve("tests/fixtures/cv");
fs.mkdirSync(root, { recursive: true });

const zip = new JSZip();
zip.file(
  "[Content_Types].xml",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
);
zip.file(
  "_rels/.rels",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
);
zip.file(
  "word/document.xml",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Sara Ali</w:t></w:r></w:p>
    <w:p><w:r><w:t>sara@example.com</w:t></w:r></w:p>
    <w:p><w:r><w:t>+92 300 1234567</w:t></w:r></w:p>
    <w:p><w:r><w:t>Experience: Backend Engineer at Zytron. Skills: NodeJS, MongoDB.</w:t></w:r></w:p>
  </w:body>
</w:document>`
);

const docxPath = path.join(root, "sample.docx");
const docxBuf = await zip.generateAsync({ type: "nodebuffer" });
fs.writeFileSync(docxPath, docxBuf);
const text = await mammoth.extractRawText({ buffer: docxBuf });
console.log("Wrote", docxPath);
console.log("Extract:", JSON.stringify(text.value));
