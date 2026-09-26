# Staff articles

Manage all articles in **Admin → Articles**
(`/dashboard-next?area=articles`). Articles, drafts and publication status are
stored in MongoDB. Editing or publishing an article does not require a code
change or deployment.

Choose **New article** and select a category in the shared editor. Categories are
News, Newsletter, Unit Updates, History & Heritage, and Museum & Foundation.
They control public labels, not editing capabilities. Save before
previewing, then publish or schedule publication. Staff need `canManageNews`;
private previews require that permission, and public pages show only published
articles. Contributor content remains in **Submissions**.

Articles in the editor require their original language; translations can be added
later. The shared editor supports headings, paragraphs, lists, images/captions and
document links. Optional series/issue details are collapsed and appear publicly
for the Newsletter category. The cover image can be shown in the article header.
Select existing media or upload images with `canUploadMedia`. Removing an image
from an article does not delete the stored asset.

Historical articles in any category retain their original publication date. They remain listed and
searchable when published but do not appear as new items in the homepage feed.

Existing plain-text stories open in the same block editor, retaining text and line
breaks in both languages. They are converted when saved; no bulk database migration
is required. Existing newsletters retain their blocks and default to the Newsletter
category; older plain-text stories default to News until a category is saved.
Both `/news-story?id=...` and existing `/newsletter?id=...` links use the shared
public renderer. Storage/API fields named `newsletter` and `newsletterBlocks`
remain compatible with existing data and import tooling; they do not define the
public category. Legacy API clients can still submit `layout: "standard"` with
bilingual plain text.

Images and documents live in CDN/object storage. The document catalog remains in
`server/public/page-content/document-library.json`. Restoring the site requires
the database and access to its media storage.

See [API ROUTES.md](API%20ROUTES.md#news-stories) for article payloads and endpoints.
