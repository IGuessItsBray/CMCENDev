# Staff articles and newsletters

Manage news stories and newsletters in **Admin → Articles**
(`/dashboard-next?area=articles`). Articles, drafts and publication status are
stored in MongoDB. Editing or publishing an article does not require a code
change or deployment.

Choose **New article**, then **News story** or **Newsletter**. Save before
previewing, then publish or schedule publication. Staff need `canManageNews`;
private previews require that permission, and public pages show only published
articles. Contributor content remains in **Submissions**.

News stories require English and French titles and bodies. Newsletters require
only their original language; translations can be added later. The newsletter
editor supports headings, paragraphs, lists, images/captions and document links.
Select existing media or upload images with `canUploadMedia`. Removing an image
from an article does not delete the stored asset.

Historical newsletters retain their original issue date. They remain listed and
searchable when published but do not appear as new items in the homepage feed.

Images and documents live in CDN/object storage. The document catalog remains in
`server/public/page-content/document-library.json`. Restoring the site requires
the database and access to its media storage.

See [API ROUTES.md](API%20ROUTES.md#news-stories) for article payloads and endpoints.
