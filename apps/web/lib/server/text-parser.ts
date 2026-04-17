import mammoth from "mammoth";

const textExtensions = new Set([".txt", ".md"]);

function extensionFor(filename: string) {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";
}

function normalizeExtractedText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isReadableChar(character: string) {
  const code = character.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code >= 160
  );
}

function assertReadableText(text: string, filename: string) {
  const visibleChars = text.replace(/\s/g, "");
  const replacementChars = (text.match(/\ufffd/g) ?? []).length;
  let lettersAndNumbers = 0;
  for (let index = 0; index < visibleChars.length; index += 1) {
    if (isReadableChar(visibleChars.charAt(index))) {
      lettersAndNumbers += 1;
    }
  }
  const readableRatio = visibleChars.length ? lettersAndNumbers / visibleChars.length : 0;
  const replacementRatio = visibleChars.length ? replacementChars / visibleChars.length : 0;

  if (visibleChars.length < 8 || readableRatio < 0.35 || replacementRatio > 0.02) {
    throw new Error(`Could not extract readable text from ${filename}. Try a selectable-text PDF, DOCX, TXT, or MD file.`);
  }
}

async function parsePdf(data: Buffer) {
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(data);
  return result.text;
}

export async function parseTextUpload(data: Buffer, filename: string) {
  const suffix = extensionFor(filename);
  let parsed: string;

  if (textExtensions.has(suffix)) {
    parsed = data.toString("utf8");
} else if (suffix === ".docx") {
    const result = await mammoth.extractRawText({ buffer: data });
    parsed = result.value;
  } else if (suffix === ".pdf") {
    try {
      parsed = await parsePdf(data);
    } catch {
      throw new Error(`Could not extract readable text from ${filename}. Try a selectable-text PDF, DOCX, TXT, or MD file.`);
    }
  } else {
    throw new Error("Unsupported text upload type. Use TXT, MD, DOCX, or PDF.");
  }

  const normalized = normalizeExtractedText(parsed);
  assertReadableText(normalized, filename);
  return normalized;
}
