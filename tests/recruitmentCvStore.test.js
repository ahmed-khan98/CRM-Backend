import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import {
  assertCvDirNotPubliclyServed,
  assertNewUploadIsPdf,
  assertResumeMagicMatches,
  detectResumeMagic,
  saveResumeToDisk,
  deleteResumeFromDisk,
  readResumeFromDisk,
  resolveCvAbsolutePath,
  getPublicStaticRoot,
  MSG_RESUME_TYPE,
  MSG_RESUME_SIZE,
  MSG_RESUME_EMPTY,
} from "../src/utils/recruitmentCvStore.js";
import { getUploadsRoot } from "../src/utils/localFileStore.js";
import { downloadResumeBuffer } from "../src/services/ai/cv/downloadResume.js";
import {
  handleRecruitmentResumeUploadError,
  MSG_RESUME_SIZE as MULTER_SIZE_MSG,
} from "../src/middlewares/recruitmentResumeUpload.js";
import multer from "multer";

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("startup check throws when CV dir is inside public/", () => {
  const publicRoot = getPublicStaticRoot();
  const bad = path.join(publicRoot, "recruitment-cv");
  assert.throws(
    () =>
      assertCvDirNotPubliclyServed(bad, {
        publicRoot,
        uploadsRoot: getUploadsRoot(),
      }),
    /must not be inside the public static directory/
  );
});

test("startup check throws when CV dir is inside getUploadsRoot()", () => {
  const uploadsRoot = getUploadsRoot();
  const bad = path.join(uploadsRoot, "cv");
  assert.throws(
    () =>
      assertCvDirNotPubliclyServed(bad, {
        publicRoot: getPublicStaticRoot(),
        uploadsRoot,
      }),
    /must not be inside getUploadsRoot/
  );
});

test("startup check allows a private storage path", () => {
  const dir = tmpDir("rec-cv-ok-");
  const resolved = assertCvDirNotPubliclyServed(dir, {
    publicRoot: getPublicStaticRoot(),
    uploadsRoot: getUploadsRoot(),
  });
  assert.equal(resolved, path.resolve(dir));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("accepts a valid PDF", () => {
  const pdf = Buffer.from("%PDF-1.4\n% valid");
  assert.equal(assertNewUploadIsPdf(pdf, "cv.pdf", "application/pdf"), "pdf");
  assert.equal(assertResumeMagicMatches(pdf, "cv.pdf"), "pdf");
});

test("rejects .docx, .doc, .jpg, and a renamed .exe", () => {
  const pdfish = Buffer.from("%PDF-1.4");
  assert.throws(
    () => assertNewUploadIsPdf(pdfish, "cv.docx", "application/pdf"),
    (e) => e.message === MSG_RESUME_TYPE
  );
  assert.throws(
    () =>
      assertNewUploadIsPdf(
        Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
        "old.doc",
        "application/msword"
      ),
    (e) => e.message === MSG_RESUME_TYPE
  );
  assert.throws(
    () =>
      assertNewUploadIsPdf(
        Buffer.from([0xff, 0xd8, 0xff]),
        "photo.jpg",
        "image/jpeg"
      ),
    (e) => e.message === MSG_RESUME_TYPE
  );
  const exe = Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(32)]);
  assert.throws(
    () => assertNewUploadIsPdf(exe, "resume.pdf", "application/pdf"),
    (e) => e.message === MSG_RESUME_TYPE && e.code === "RESUME_MAGIC_MISMATCH"
  );
  // detect still recognizes legacy formats for old HR downloads
  assert.equal(
    detectResumeMagic(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
    "docx"
  );
});

test("rejects a file over 5 MB and an empty file", () => {
  assert.throws(
    () => assertNewUploadIsPdf(Buffer.alloc(0), "a.pdf", "application/pdf"),
    (e) => e.message === MSG_RESUME_EMPTY
  );
  const dir = tmpDir("rec-cv-big-");
  const temp = path.join(dir, "big.pdf");
  fs.writeFileSync(temp, Buffer.concat([Buffer.from("%PDF-1.4"), Buffer.alloc(100)]));
  assert.throws(
    () =>
      saveResumeToDisk(
        {
          path: temp,
          originalname: "big.pdf",
          mimetype: "application/pdf",
          size: 6 * 1024 * 1024,
        },
        { cvDir: dir }
      ),
    (e) => e.message === MSG_RESUME_SIZE
  );
  assert.equal(fs.existsSync(temp), false); // orphan cleaned on rejection
  fs.rmSync(dir, { recursive: true, force: true });
});

test("no orphan file remains after a rejection", () => {
  const dir = tmpDir("rec-cv-rej-");
  const temp = path.join(dir, "bad.pdf");
  fs.writeFileSync(temp, Buffer.from([0x4d, 0x5a, 0, 0, 0, 0]));
  assert.throws(() =>
    saveResumeToDisk(
      {
        path: temp,
        originalname: "virus.pdf",
        mimetype: "application/pdf",
        size: 6,
      },
      { cvDir: dir }
    )
  );
  assert.equal(fs.existsSync(temp), false);
  const leftover = fs.readdirSync(dir).filter((f) => f.endsWith(".pdf"));
  assert.equal(leftover.length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Multer errors return 400 JSON", () => {
  const res = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  const err = new multer.MulterError("LIMIT_FILE_SIZE");
  handleRecruitmentResumeUploadError(err, {}, res, () => {
    throw new Error("should not next");
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, MULTER_SIZE_MSG);
  assert.equal(res.body.success, false);
});

test("path traversal is blocked", () => {
  const dir = tmpDir("rec-cv-trav-");
  assert.throws(
    () => resolveCvAbsolutePath("../secret.pdf", dir),
    /Invalid resume path|traversal/i
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test("disk read works for new records", () => {
  const dir = tmpDir("rec-cv-disk-");
  const temp = path.join(dir, "upload-temp.pdf");
  fs.writeFileSync(temp, "%PDF-1.4\nfake content");
  const saved = saveResumeToDisk(
    {
      path: temp,
      originalname: "My Resume.pdf",
      mimetype: "application/pdf",
      size: 20,
    },
    { cvDir: dir }
  );
  assert.match(saved.resumePath, /^[0-9a-f-]{36}\.pdf$/i);
  assert.equal(saved.resumeFileName, "My Resume.pdf");
  const read = readResumeFromDisk(saved.resumePath, dir);
  assert.ok(read.buffer.toString("utf8").startsWith("%PDF"));
  deleteResumeFromDisk(saved.resumePath, dir);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Cloudinary fallback works for old records", async () => {
  const payload = Buffer.from("%PDF-1.4 legacy cloudinary");
  const result = await downloadResumeBuffer(
    {
      resumeFileName: "old.pdf",
      resumeUrl: "https://res.cloudinary.com/demo/raw/upload/v1/x.pdf",
      resumePublicId: "x",
    },
    {
      retries: 0,
      fetchAttachment: async () =>
        new Response(payload, {
          status: 200,
          headers: { "content-type": "application/pdf" },
        }),
      readDisk: () => {
        throw new Error("should not read disk");
      },
    }
  );
  assert.equal(result.buffer.equals(payload), true);
  assert.equal(
    result.cvHash,
    crypto.createHash("sha256").update(payload).digest("hex")
  );
});

test("Old DOCX on disk still opens for HR (read path)", () => {
  const dir = tmpDir("rec-cv-docx-");
  const name = `${crypto.randomUUID()}.docx`;
  const body = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
  fs.writeFileSync(path.join(dir, name), body);
  const read = readResumeFromDisk(name, dir);
  assert.equal(read.ext, "docx");
  assert.equal(read.buffer.equals(body), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("orphan file is cleaned up when application creation fails", () => {
  const dir = tmpDir("rec-cv-orphan-");
  const temp = path.join(dir, "tmp.pdf");
  fs.writeFileSync(temp, "%PDF-1.4 orphan-test");
  const saved = saveResumeToDisk(
    {
      path: temp,
      originalname: "cv.pdf",
      mimetype: "application/pdf",
      size: 18,
    },
    { cvDir: dir }
  );
  assert.ok(fs.existsSync(path.join(dir, saved.resumePath)));
  const cleaned = deleteResumeFromDisk(saved.resumePath, dir);
  assert.equal(cleaned, true);
  assert.equal(fs.existsSync(path.join(dir, saved.resumePath)), false);
  fs.rmSync(dir, { recursive: true, force: true });
});
