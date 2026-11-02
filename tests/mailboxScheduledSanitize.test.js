import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeScheduledDoc,
  sanitizeScheduledList,
} from "../src/utils/mailbox/scheduledSanitize.js";
import {
  sanitizeDownloadFilename,
  contentDispositionAttachment,
  validateAndNormalizeAttachments,
  assertSafeHeaderValue,
} from "../src/utils/mailbox/mailSchemas.js";
import { timingSafeEqualString } from "../src/utils/mailbox/messageId.js";

test("sanitizeScheduledDoc never returns contentBase64", () => {
  const row = {
    _id: "abc",
    subject: "hi",
    attachments: [
      {
        filename: "a.pdf",
        contentType: "application/pdf",
        contentBase64: "QUJDRA==",
        size: 4,
      },
    ],
  };
  const out = sanitizeScheduledDoc(row);
  assert.equal(out.subject, "hi");
  assert.equal(out.attachments.length, 1);
  assert.equal(out.attachments[0].filename, "a.pdf");
  assert.equal(out.attachments[0].hasContent, true);
  assert.equal("contentBase64" in out.attachments[0], false);
  assert.equal(JSON.stringify(out).includes("QUJDRA"), false);
});

test("sanitizeScheduledList strips payloads from every row", () => {
  const list = sanitizeScheduledList([
    {
      attachments: [{ filename: "x.txt", contentBase64: "eHg=" }],
    },
  ]);
  assert.equal(list[0].attachments[0].hasContent, true);
  assert.equal(list[0].attachments[0].contentBase64, undefined);
});

test("validateAndNormalizeAttachments enforces size and type", () => {
  const tiny = Buffer.from("hello").toString("base64");
  const ok = validateAndNormalizeAttachments([
    {
      filename: "note.txt",
      contentType: "text/plain",
      contentBase64: tiny,
    },
  ]);
  assert.equal(ok[0].filename, "note.txt");
  assert.equal(ok[0].size, 5);

  assert.throws(
    () =>
      validateAndNormalizeAttachments([
        {
          filename: "evil.exe",
          contentType: "application/x-msdownload",
          contentBase64: tiny,
        },
      ]),
    /not allowed/i,
  );
});

test("assertSafeHeaderValue rejects CR/LF", () => {
  assert.throws(
    () => assertSafeHeaderValue("a\r\nBcc: evil@x.com", "inReplyTo"),
    /newlines/i,
  );
});

test("download filename + Content-Disposition are sanitized", () => {
  const name = sanitizeDownloadFilename('a/../b\r\n"q".pdf');
  assert.equal(name.includes("\r"), false);
  assert.equal(name.includes("\n"), false);
  assert.equal(name.includes("/"), false);
  const cd = contentDispositionAttachment(name);
  assert.match(cd, /^attachment;/);
  assert.match(cd, /filename\*=UTF-8''/);
});

test("timingSafeEqualString works for cron secrets", () => {
  assert.equal(timingSafeEqualString("abc", "abc"), true);
  assert.equal(timingSafeEqualString("abc", "abd"), false);
  assert.equal(timingSafeEqualString("abc", "ab"), false);
});
