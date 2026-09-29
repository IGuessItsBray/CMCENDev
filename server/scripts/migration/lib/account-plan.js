// Read-only planning from the private WordPress identity audit. Never infer
// ownership from display names or guest-comment email matches.
function planAccounts(audit, destinationUsers) {
  if (
    !Array.isArray(audit?.users) ||
    !Array.isArray(audit.posts) ||
    !Array.isArray(audit.comments)
  )
    throw new Error('Invalid identity audit');
  if (destinationUsers !== undefined && !Array.isArray(destinationUsers))
    throw new Error('Invalid destination identity inventory');
  const ids = new Set();
  const emails = new Map();
  const logins = new Map();
  for (const user of audit.users) {
    if (!Number.isSafeInteger(user.id) || user.id <= 0 || ids.has(user.id))
      throw new Error('Invalid or duplicate WordPress user ID');
    ids.add(user.id);
    for (const [map, value] of [
      [emails, user.emailHash],
      [logins, user.loginHash],
    ]) {
      if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
        throw new Error('Invalid identity hash');
      map.set(value, (map.get(value) || 0) + 1);
    }
  }
  const destination = destinationUsers || [];
  for (const user of destination) {
    if (
      !user.id ||
      !/^[a-f0-9]{64}$/.test(user.emailHash || '') ||
      !/^[a-f0-9]{64}$/.test(user.loginHash || '')
    )
      throw new Error('Invalid destination identity');
  }
  const rows = audit.users.map((user) => {
    const holds = [];
    if (user.emailPlausible !== true) holds.push('invalid-email');
    if (emails.get(user.emailHash) > 1) holds.push('duplicate-source-email');
    if (logins.get(user.loginHash) > 1) holds.push('duplicate-source-login');
    if (String(user.status) !== '0') holds.push('source-status-review');
    const collisions = destination.filter(
      (d) => d.emailHash === user.emailHash || d.loginHash === user.loginHash,
    );
    if (collisions.length) holds.push('destination-collision-review');
    return {
      sourceUserId: user.id,
      destinationUserId: null,
      status: holds.length
        ? 'review'
        : destinationUsers === undefined
          ? 'awaiting-destination-check'
          : 'ready-for-import-preparation',
      holds,
      collisionIds: collisions.map((d) => d.id),
      authoredSourceRecords: audit.posts.filter((p) => p.authorId === user.id)
        .length,
      registeredSourceComments: audit.comments.filter(
        (c) => c.userId === user.id,
      ).length,
    };
  });
  return {
    version: 1,
    readOnly: true,
    destinationChecked: destinationUsers !== undefined,
    activationReady: false,
    summary: {
      users: rows.length,
      review: rows.filter((r) => r.holds.length).length,
      awaitingDestination: rows.filter(
        (r) => r.status === 'awaiting-destination-check',
      ).length,
      guestComments: audit.comments.filter((c) => !c.userId).length,
      missingCommentUserIds: [
        ...new Set(
          audit.comments
            .filter((c) => c.userId && !ids.has(c.userId))
            .map((c) => c.userId),
        ),
      ],
      missingPostAuthorIds: [
        ...new Set(
          audit.posts
            .filter((p) => p.authorId && !ids.has(p.authorId))
            .map((p) => p.authorId),
        ),
      ],
    },
    users: rows,
  };
}

module.exports = { planAccounts };
