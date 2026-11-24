# 07 Company profile (with logo and offer letter format)

Source:
- `src/modules/company/pages/CompanyProfile.tsx`
- `src/modules/company/components/OfferLetterPanel.tsx`
- `useCore.updateCompany`, `setLogo` and `setOfferLetter`

## 1. Purpose
Keeps the company's legal identity, registered address, primary contact and logo. It also holds the one offer letter format that HRMS uses.

## 2. Route & access
- Path: `/company`
- Access: Tenant Admin. Only the Tenant Admin uploads the offer letter format.

## 3. Data displayed
`CompanyProfile` from `useCore.company`:

| Field | Type | Notes |
|---|---|---|
| legalName, tradeName | string | |
| pan, gstin, cin, tan | string | GSTIN, CIN and TAN are shown read-only, "Extracted from PAN" |
| addressLine1, addressLine2, city, state, pin, country | string | |
| contactName, contactEmail, contactPhone, website | string | |
| logo | string (data URL) | |
| offerLetter | `OfferLetterFile \| null` | See the next table. |

`OfferLetterFile` fields:
- `fileId`, `fileName`, `mimeType`;
- `size` (bytes) and `dataUrl`;
- `revision` (number);
- `updatedAt` and `updatedBy`.

## 4. User actions
| Control | Effect |
|---|---|
| Edit | Opens the edit form. |
| Save | `updateCompany(values)`. Shows "Company profile saved". Writes one audit entry that lists only the changed fields. |
| Cancel | Leaves the form without saving. |
| Upload logo | PNG, JPG or SVG, at most 512 KB. Calls `setLogo(dataUrl)`. Shows "Logo updated". |
| Remove logo | `setLogo('')`. Shows "Logo removed". |
| Offer letter → Preview | A full-screen dialog. PDFs show inline with a Print button. Word files show a note to download. |
| Offer letter → Download | Downloads the file from its data URL. |
| Offer letter → Update format (in edit mode) | Pick a file, then **Replace format** (or **Use this format** when none exists) or **Keep current**. See below. |

Replacing the offer letter calls `setOfferLetter`, which gives it a new `fileId` and adds 1 to `revision`.

## 5. Forms & validation
| Field | Required | Rule and message |
|---|---|---|
| legalName | yes | "Legal name is required." |
| tradeName | no | — |
| pan | yes | `^[A-Z]{5}\d{4}[A-Z]$`: "PAN is 10 characters, e.g. AAHCV1234K." |
| gstin | yes | `^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`: "GSTIN is 15 characters, e.g. 36AAHCV1234K1Z8." Characters 3 to 12 must be the PAN, and the last character must be the GSTN check character; either mistake blocks the save. Pre-filled from the PAN and the state (registration number 1) while empty. |
| cin | yes | `^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$`: "CIN is 21 characters, e.g. U45200TG2019PTC134567." |
| tan | yes | `^[A-Z]{4}\d{5}[A-Z]$`: "TAN is 10 characters, e.g. HYDV01234B." |
| warnings (do not block) | — | PAN 4th character not C (not a company), PAN 5th character not the legal name's initial, GSTIN for another state than the registered address, CIN year or company type unlikely (or L without PLC), TAN 4th character not the name's initial. Rules: `src/modules/company/utils/taxIds.ts`. GSTIN, CIN and TAN are typed in: they are not looked up on government sites (owner decision, 2026-11-21). |
| addressLine1, city, state, country, contactName | yes | "<Label> is required." |
| addressLine2 | no | — |
| pin | yes | `^\d{6}$`: "PIN code is 6 digits." |
| contactEmail | yes | email: "Enter a valid email address." |
| contactPhone | yes | `^[6-9]\d{9}$`: "Enter a 10-digit mobile number." |
| website | no | empty, or a URL: "Enter a full URL starting with https://" |
| logo file | — | "Use a PNG, JPG or SVG file." / "Logo must be 512 KB or smaller." |
| offer letter file | — | .pdf, .doc or .docx: "Use a PDF or Word file (.pdf, .doc, .docx)." At most 2 MB: "The file must be 2 MB or smaller." |

## 6. Existing API calls
None. The offer letter download calls `fetch(dataUrl)` only to turn the in-memory data URL into a blob.

## 7. Backend requirements (inferred)
**GET `/api/v1/company`** returns `CompanyProfile`. `logo` and `offerLetter` should come back as URLs, not data URLs.

**PUT `/api/v1/company`**: the body is the profile without `logo` and `offerLetter`. 200 returns the profile. 422 returns field errors.

**GET `/api/v1/company/pan-lookup?pan=AAHCV1234K`** returns `{ "gstin": "...", "cin": "...", "tan": "..." }`. This is named in a code comment: "GSTIN/CIN/TAN come from a PAN lookup".

**PUT `/api/v1/company/logo`** (multipart `file`) returns `{ "logo": "https://.../logo.png" }`. **DELETE `/api/v1/company/logo`** returns 204. 413 if the file is too big; 415 for a wrong type.

**PUT `/api/v1/company/offer-letter`** (multipart `file`)
```json
{ "fileId": "FILE-OL-4", "fileName": "offer-letter.pdf", "mimeType": "application/pdf", "size": 182340, "url": "https://.../FILE-OL-4", "revision": 4, "updatedAt": "2026-11-19T10:00:00", "updatedBy": "Anil Mehta" }
```
**GET `/api/v1/company/offer-letter`** returns the same shape, or 404. **GET `/api/v1/files/{fileId}`** streams the file.

Every write adds an audit entry.

## 8. State & side effects
- Uses file storage for the logo and offer letter.
- Writes audit entries: "Company profile updated", "Logo changed", "Logo removed", "Offer letter format uploaded" and "Offer letter format replaced".
- The offer letter preview builds an object URL and releases it afterwards.

## 9. Navigation
- From: the menu, the account menu.
- To: none. [27 Job openings](27-job-openings.md) shows the same offer letter format.

## 10. Open questions
- Is the PAN lookup a real external service? Which one?
- Should old offer letter revisions be kept for download, or only the current one?
- The state field uses a list of Indian states. Is the company always in India?
