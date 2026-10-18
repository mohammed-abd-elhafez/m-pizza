// Invisible or direction-changing characters can make text look different from what it is (for example a
// right-to-left override reversing a note on the kitchen screen), so they are removed from all free text.
const BIDI_AND_INVISIBLE = /[​-‏‪-‮⁠-⁤⁦-⁩﻿­᠎]/g;
const CONTROL_EXCEPT_NEWLINE_TAB = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** Normalises free text supplied by customers or staff. Keeps letters (including Arabic), emoji, digits and newlines. */
export function cleanText(input: string): string {
  return input
    .normalize("NFC")
    .replace(BIDI_AND_INVISIBLE, "")
    .replace(CONTROL_EXCEPT_NEWLINE_TAB, "")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}
