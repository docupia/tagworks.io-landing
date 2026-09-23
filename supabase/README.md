# Tagworks Supabase contract

The migration creates two application tables and one private Storage bucket:

- `pages` owns the permanent slug and the active publication pointer.
- `page_versions` records each immutable original upload and its server-sanitized artifact.
- `page-originals` stores source files privately, below `<user-id>/...`.

Authenticated browser clients have owner-scoped `SELECT` access only. They cannot
insert, update, or delete application records through the Data API. The trusted
Next.js upload route must validate the Supabase session, sanitize the HTML, upload
the source with that user's session, then use its server-only PostgreSQL connection
to commit the metadata transaction.

## Publish transaction

Use one PostgreSQL transaction in this order:

1. Insert a `pages` row in `draft` state and retain its generated `id`.
2. Insert a `page_versions` row for the private Storage object and sanitized HTML,
   then retain its `id`.
3. Update the page with `published_version_id = <version-id>` and
   `status = 'published'`.

The publication trigger rejects step 3 unless the selected version belongs to the
page and already has sanitized HTML. The composite foreign keys prevent cross-page
version pointers. A database transaction should be rolled back if any step fails;
the API should also remove the just-uploaded Storage object on failure.

The public RPC calculates `artifact_sha256` from the exact UTF-8 bytes stored in
`sanitized_html`.
`source_sha256` hashes the original upload. Both values are lowercase hex SHA-256.

The database intentionally does not attempt to parse or sanitize HTML. The web
service must sanitize before inserting an artifact, and the isolated publisher
must still return a restrictive Content Security Policy. This gives defense in
depth even if an artifact is malformed.

## Fixed links and removal

`slug` is immutable. Physical deletes are not granted to browser roles. To remove
a page while permanently reserving its link, the trusted service updates it in a
single statement:

```sql
update public.pages
set status = 'deleted', deleted_at = timezone('utc', now())
where id = $1 and owner_id = $2 and deleted_at is null;
```

The tombstone cannot be changed afterward. Pausing a link uses `status = 'paused'`
without setting `deleted_at`; republishing can select an existing or newly created
version and set `status = 'published'`.

Anonymous publication reads go only through:

```sql
select * from public.get_published_page('fixed-slug');
```

Draft, paused, deleted, cross-user, Storage-path, and original-file information is
never returned by that function.
